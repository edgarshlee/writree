package io.github.writree.server.sync;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "document_revisions")
public class DocumentRevision {
    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "document_id", nullable = false)
    private DocumentEntity document;

    @Column(nullable = false)
    private int revision;

    @Column(columnDefinition = "text")
    private String content;

    @Column(name = "content_hash", nullable = false, length = 64)
    private String contentHash;

    @Column(nullable = false)
    private boolean deleted;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected DocumentRevision() {
    }

    public static DocumentRevision capture(DocumentEntity document) {
        var revision = new DocumentRevision();
        revision.id = UUID.randomUUID();
        revision.document = document;
        revision.revision = document.getCurrentRevision();
        revision.content = document.getContent();
        revision.contentHash = document.getContentHash();
        revision.deleted = document.isDeleted();
        revision.createdAt = Instant.now();
        return revision;
    }

    public UUID getId() { return id; }
    public DocumentEntity getDocument() { return document; }
    public int getRevision() { return revision; }
    public String getContent() { return content; }
    public String getContentHash() { return contentHash; }
    public boolean isDeleted() { return deleted; }
    public Instant getCreatedAt() { return createdAt; }
}
