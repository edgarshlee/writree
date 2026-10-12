package io.github.writree.server.sync;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface DocumentRepository extends JpaRepository<DocumentEntity, UUID> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<DocumentEntity> findByWorkspaceIdAndRelativePath(UUID workspaceId, String relativePath);

    Optional<DocumentEntity> findByIdAndWorkspaceOwnerId(UUID id, UUID ownerId);
    long deleteByDeletedTrueAndDeletedAtBefore(Instant cutoff);
}
