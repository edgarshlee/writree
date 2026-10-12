package io.github.writree.server.sync;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class SyncContracts {
    private SyncContracts() { }

    public record SyncRequest(
            @NotBlank @Size(max = 255) String deviceId,
            Long cursor,
            @NotNull @Size(max = 500) List<@Valid DocumentChange> changes
    ) { }

    public record DocumentChange(
            @NotBlank @Size(max = 1024) String relativePath,
            String content,
            @NotBlank @Pattern(regexp = "[a-f0-9]{64}") String contentHash,
            Integer baseRevision,
            boolean deleted,
            @NotNull Instant clientUpdatedAt
    ) { }

    public record Revision(
            UUID id,
            UUID documentId,
            String relativePath,
            int revision,
            String contentHash,
            boolean deleted,
            Instant createdAt
    ) { }

    public record Conflict(
            String relativePath,
            String localHash,
            int remoteRevision,
            String remoteContent,
            boolean remoteDeleted
    ) { }

    public record SyncResult(long cursor, List<Revision> accepted, List<DocumentChange> remoteChanges, List<Conflict> conflicts) { }

    public record RevisionDetail(UUID id, int revision, String contentHash, boolean deleted, Instant createdAt, String content) { }
}
