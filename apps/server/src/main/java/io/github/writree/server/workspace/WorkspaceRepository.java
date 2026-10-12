package io.github.writree.server.workspace;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface WorkspaceRepository extends JpaRepository<Workspace, UUID> {
    List<Workspace> findAllByOwnerIdOrderByUpdatedAtDesc(UUID ownerId);
    Optional<Workspace> findByIdAndOwnerId(UUID id, UUID ownerId);
}
