package io.github.writree.server.sync;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface DocumentRevisionRepository extends JpaRepository<DocumentRevision, UUID> {
    List<DocumentRevision> findByDocumentIdOrderByRevisionDesc(UUID documentId, Pageable pageable);
    Optional<DocumentRevision> findByIdAndDocumentId(UUID id, UUID documentId);
    Optional<DocumentRevision> findByDocumentIdAndRevision(UUID documentId, int revision);

    @Modifying
    @Query(value = "DELETE FROM document_revisions WHERE id IN (SELECT id FROM document_revisions WHERE document_id = :documentId ORDER BY revision DESC OFFSET :keep)", nativeQuery = true)
    void deleteOlderThanLimit(@Param("documentId") UUID documentId, @Param("keep") int keep);
}
