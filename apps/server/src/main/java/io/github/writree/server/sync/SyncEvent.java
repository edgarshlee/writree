package io.github.writree.server.sync;

import io.github.writree.server.workspace.Workspace;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "sync_events")
public class SyncEvent {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long cursor;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "workspace_id", nullable = false)
    private Workspace workspace;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "document_id", nullable = false)
    private DocumentEntity document;

    @Column(name = "device_external_id", nullable = false)
    private String deviceExternalId;

    @Column(name = "relative_path", nullable = false, length = 1024)
    private String relativePath;

    @Column(nullable = false)
    private int revision;

    @Column(name = "content_hash", nullable = false, length = 64)
    private String contentHash;

    @Column(nullable = false)
    private boolean deleted;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected SyncEvent() {
    }

    public static SyncEvent create(Workspace workspace, DocumentEntity document, String deviceExternalId) {
        var event = new SyncEvent();
        event.workspace = workspace;
        event.document = document;
        event.deviceExternalId = deviceExternalId;
        event.relativePath = document.getRelativePath();
        event.revision = document.getCurrentRevision();
        event.contentHash = document.getContentHash();
        event.deleted = document.isDeleted();
        event.createdAt = Instant.now();
        return event;
    }

    public Long getCursor() { return cursor; }
    public DocumentEntity getDocument() { return document; }
    public String getDeviceExternalId() { return deviceExternalId; }
    public String getRelativePath() { return relativePath; }
    public int getRevision() { return revision; }
    public String getContentHash() { return contentHash; }
    public boolean isDeleted() { return deleted; }
    public Instant getCreatedAt() { return createdAt; }
}
