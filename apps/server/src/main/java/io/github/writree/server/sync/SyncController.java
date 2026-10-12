package io.github.writree.server.sync;

import io.github.writree.server.user.CurrentUser;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1")
public class SyncController {
    private final SyncService sync;

    public SyncController(SyncService sync) { this.sync = sync; }

    @PostMapping("/workspaces/{workspaceId}/sync")
    SyncContracts.SyncResult sync(@PathVariable UUID workspaceId, @Valid @RequestBody SyncContracts.SyncRequest request, Authentication authentication) {
        return sync.sync(CurrentUser.id(authentication), workspaceId, request);
    }

    @GetMapping("/documents/{documentId}/revisions")
    List<SyncContracts.RevisionDetail> revisions(@PathVariable UUID documentId, Authentication authentication) {
        return sync.revisions(CurrentUser.id(authentication), documentId);
    }

    @PostMapping("/documents/{documentId}/revisions/{revisionId}/restore")
    @ResponseStatus(HttpStatus.CREATED)
    SyncContracts.Revision restore(@PathVariable UUID documentId, @PathVariable UUID revisionId, Authentication authentication) {
        return sync.restore(CurrentUser.id(authentication), documentId, revisionId);
    }
}
