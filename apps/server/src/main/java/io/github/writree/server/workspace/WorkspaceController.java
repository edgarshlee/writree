package io.github.writree.server.workspace;

import io.github.writree.server.user.CurrentUser;
import io.github.writree.server.user.UserAccountRepository;
import io.github.writree.server.web.ApiException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/workspaces")
public class WorkspaceController {
    private final WorkspaceRepository workspaces;
    private final UserAccountRepository users;

    public WorkspaceController(WorkspaceRepository workspaces, UserAccountRepository users) {
        this.workspaces = workspaces;
        this.users = users;
    }

    @GetMapping
    @Transactional(readOnly = true)
    List<WorkspaceResponse> list(Authentication authentication) {
        return workspaces.findAllByOwnerIdOrderByUpdatedAtDesc(CurrentUser.id(authentication)).stream().map(WorkspaceResponse::from).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    WorkspaceResponse create(@Valid @RequestBody CreateWorkspaceRequest request, Authentication authentication) {
        var user = users.findById(CurrentUser.id(authentication)).orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "사용자를 찾지 못했습니다."));
        return WorkspaceResponse.from(workspaces.save(Workspace.create(user, request.name().trim())));
    }

    @DeleteMapping("/{workspaceId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    void delete(@PathVariable UUID workspaceId, Authentication authentication) {
        var workspace = workspaces.findByIdAndOwnerId(workspaceId, CurrentUser.id(authentication)).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "WORKSPACE_NOT_FOUND", "워크스페이스를 찾지 못했습니다."));
        workspaces.delete(workspace);
    }

    record CreateWorkspaceRequest(@NotBlank @Size(max = 255) String name) { }
    public record WorkspaceResponse(UUID id, String name, Instant updatedAt) {
        static WorkspaceResponse from(Workspace workspace) { return new WorkspaceResponse(workspace.getId(), workspace.getName(), workspace.getUpdatedAt()); }
    }
}
