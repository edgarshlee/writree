package io.github.writree.server.sync;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface SyncEventRepository extends JpaRepository<SyncEvent, Long> {
    List<SyncEvent> findTop500ByWorkspaceIdAndCursorGreaterThanOrderByCursorAsc(UUID workspaceId, long cursor);
    long deleteByDocumentId(UUID documentId);
}
