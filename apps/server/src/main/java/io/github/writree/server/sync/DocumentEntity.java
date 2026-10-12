package io.github.writree.server.sync;

import io.github.writree.server.workspace.Workspace;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "documents")
public class DocumentEntity {
    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "workspace_id", nullable = false)
    private Workspace workspace;

    @Column(name = "relative_path", nullable = false, length = 1024)
    private String relativePath;

    @Column(columnDefinition = "text")
    private String content;

    @Column(name = "content_hash", nullable = false, length = 64)
    private String contentHash;

    @Column(name = "current_revision", nullable = false)
    private int currentRevision;

    @Column(nullable = false)
    private boolean deleted;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    @Column(name = "client_updated_at", nullable = false)
    private Instant clientUpdatedAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    @Column(name = "row_version", nullable = false)
    private long rowVersion;

    protected DocumentEntity() {
    }

    public static DocumentEntity create(Workspace workspace, String path, String content, String contentHash, boolean deleted, Instant clientUpdatedAt) {
        var document = new DocumentEntity();
        document.id = UUID.randomUUID();
        document.workspace = workspace;
        document.relativePath = path;
        document.currentRevision = 1;
        document.apply(content, contentHash, deleted, clientUpdatedAt);
        return document;
    }

    public int update(String content, String contentHash, boolean deleted, Instant clientUpdatedAt) {
        currentRevision += 1;
        apply(content, contentHash, deleted, clientUpdatedAt);
        return currentRevision;
    }

    private void apply(String content, String contentHash, boolean deleted, Instant clientUpdatedAt) {
        this.content = deleted ? null : content;
        this.contentHash = contentHash;
        this.deleted = deleted;
        this.deletedAt = deleted ? Instant.now() : null;
        this.clientUpdatedAt = clientUpdatedAt;
        this.updatedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public Workspace getWorkspace() { return workspace; }
    public String getRelativePath() { return relativePath; }
    public String getContent() { return content; }
    public String getContentHash() { return contentHash; }
    public int getCurrentRevision() { return currentRevision; }
    public boolean isDeleted() { return deleted; }
    public Instant getClientUpdatedAt() { return clientUpdatedAt; }
}
