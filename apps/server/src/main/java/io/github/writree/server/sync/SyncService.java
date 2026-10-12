package io.github.writree.server.sync;

import io.github.writree.server.config.SyncProperties;
import io.github.writree.server.web.ApiException;
import io.github.writree.server.workspace.Workspace;
import io.github.writree.server.workspace.WorkspaceRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

import static io.github.writree.server.sync.SyncContracts.*;

@Service
public class SyncService {
    private final WorkspaceRepository workspaces;
    private final DocumentRepository documents;
    private final DocumentRevisionRepository revisions;
    private final SyncEventRepository events;
    private final SyncProperties properties;

    public SyncService(WorkspaceRepository workspaces, DocumentRepository documents, DocumentRevisionRepository revisions, SyncEventRepository events, SyncProperties properties) {
        this.workspaces = workspaces;
        this.documents = documents;
        this.revisions = revisions;
        this.events = events;
        this.properties = properties;
    }

    @Transactional
    public SyncResult sync(UUID userId, UUID workspaceId, SyncRequest request) {
        Workspace workspace = ownedWorkspace(userId, workspaceId);
        List<Revision> accepted = new ArrayList<>();
        List<Conflict> conflicts = new ArrayList<>();

        for (DocumentChange incoming : request.changes()) {
            var change = normalized(incoming);
            var existing = documents.findByWorkspaceIdAndRelativePath(workspaceId, change.relativePath());
            Integer remoteRevision = existing.map(DocumentEntity::getCurrentRevision).orElse(null);
            if (!Objects.equals(remoteRevision, change.baseRevision())) {
                existing.ifPresent(document -> conflicts.add(new Conflict(
                        change.relativePath(), change.contentHash(), document.getCurrentRevision(), document.getContent(), document.isDeleted())));
                if (existing.isEmpty()) conflicts.add(new Conflict(change.relativePath(), change.contentHash(), 0, null, true));
                continue;
            }

            DocumentEntity document = existing
                    .map(value -> { value.update(change.content(), change.contentHash(), change.deleted(), change.clientUpdatedAt()); return value; })
                    .orElseGet(() -> DocumentEntity.create(workspace, change.relativePath(), change.content(), change.contentHash(), change.deleted(), change.clientUpdatedAt()));
            documents.saveAndFlush(document);
            DocumentRevision revision = revisions.save(DocumentRevision.capture(document));
            events.save(SyncEvent.create(workspace, document, request.deviceId()));
            revisions.deleteOlderThanLimit(document.getId(), properties.revisionRetention());
            accepted.add(toRevision(revision));
        }

        events.flush();
        long requestedCursor = request.cursor() == null ? 0 : Math.max(0, request.cursor());
        var newEvents = events.findTop500ByWorkspaceIdAndCursorGreaterThanOrderByCursorAsc(workspaceId, requestedCursor);
        long nextCursor = newEvents.stream().mapToLong(SyncEvent::getCursor).max().orElse(requestedCursor);
        List<DocumentChange> remoteChanges = newEvents.stream()
                .filter(event -> !event.getDeviceExternalId().equals(request.deviceId()))
                .map(this::toChange)
                .toList();
        return new SyncResult(nextCursor, accepted, remoteChanges, conflicts);
    }

    @Transactional(readOnly = true)
    public List<RevisionDetail> revisions(UUID userId, UUID documentId) {
        DocumentEntity document = documents.findByIdAndWorkspaceOwnerId(documentId, userId).orElseThrow(() -> notFound("문서를 찾지 못했습니다."));
        return revisions.findByDocumentIdOrderByRevisionDesc(document.getId(), PageRequest.of(0, properties.revisionRetention())).stream().map(this::toDetail).toList();
    }

    @Transactional
    public Revision restore(UUID userId, UUID documentId, UUID revisionId) {
        DocumentEntity document = documents.findByIdAndWorkspaceOwnerId(documentId, userId).orElseThrow(() -> notFound("문서를 찾지 못했습니다."));
        DocumentRevision source = revisions.findByIdAndDocumentId(revisionId, documentId).orElseThrow(() -> notFound("Revision을 찾지 못했습니다."));
        document.update(source.getContent(), source.getContentHash(), source.isDeleted(), Instant.now());
        documents.saveAndFlush(document);
        DocumentRevision restored = revisions.save(DocumentRevision.capture(document));
        events.save(SyncEvent.create(document.getWorkspace(), document, "server-restore"));
        revisions.deleteOlderThanLimit(document.getId(), properties.revisionRetention());
        return toRevision(restored);
    }

    @Scheduled(cron = "0 41 3 * * *")
    @Transactional
    public void purgeExpiredTombstones() {
        documents.deleteByDeletedTrueAndDeletedAtBefore(Instant.now().minus(properties.tombstoneDays(), ChronoUnit.DAYS));
    }

    private Workspace ownedWorkspace(UUID userId, UUID workspaceId) {
        return workspaces.findByIdAndOwnerId(workspaceId, userId).orElseThrow(() -> notFound("워크스페이스를 찾지 못했습니다."));
    }

    private DocumentChange normalized(DocumentChange change) {
        String path = normalizePath(change.relativePath());
        String content = change.deleted() ? null : Objects.requireNonNullElse(change.content(), "").replace("\r\n", "\n");
        if (content != null && content.getBytes(StandardCharsets.UTF_8).length > properties.maxDocumentBytes()) {
            throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "DOCUMENT_TOO_LARGE", "동기화 문서는 5MB 이하여야 합니다.");
        }
        String expectedHash = sha256(content == null ? "" : content);
        if (!expectedHash.equals(change.contentHash())) throw new ApiException(HttpStatus.BAD_REQUEST, "HASH_MISMATCH", "문서 해시가 본문과 일치하지 않습니다: " + path);
        return new DocumentChange(path, content, expectedHash, change.baseRevision(), change.deleted(), change.clientUpdatedAt());
    }

    static String normalizePath(String raw) {
        String path = raw.replace('\\', '/').replaceAll("/+", "/");
        if (path.startsWith("/") || path.matches("^[A-Za-z]:.*") || path.contains("../") || path.equals("..") || path.indexOf('\0') >= 0) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_PATH", "상대 경로만 동기화할 수 있습니다.");
        }
        String lower = path.toLowerCase();
        boolean allowed = lower.endsWith(".md") || lower.endsWith(".markdown");
        if (!allowed) throw new ApiException(HttpStatus.BAD_REQUEST, "UNSUPPORTED_FILE", "Markdown 문서만 동기화할 수 있습니다.");
        return path;
    }

    private DocumentChange toChange(SyncEvent event) {
        DocumentRevision revision = revisions.findByDocumentIdAndRevision(event.getDocument().getId(), event.getRevision())
                .orElseThrow(() -> new IllegalStateException("Sync event revision is missing"));
        return new DocumentChange(event.getRelativePath(), revision.getContent(), event.getContentHash(), event.getRevision(), event.isDeleted(), event.getCreatedAt());
    }

    private Revision toRevision(DocumentRevision revision) {
        return new Revision(revision.getId(), revision.getDocument().getId(), revision.getDocument().getRelativePath(), revision.getRevision(), revision.getContentHash(), revision.isDeleted(), revision.getCreatedAt());
    }

    private RevisionDetail toDetail(DocumentRevision revision) {
        return new RevisionDetail(revision.getId(), revision.getRevision(), revision.getContentHash(), revision.isDeleted(), revision.getCreatedAt(), revision.getContent());
    }

    static String sha256(String content) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(content.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }

    private ApiException notFound(String message) { return new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", message); }
}
