package io.github.writree.server.user;

import io.github.writree.server.web.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/me")
public class UserController {
    private final UserAccountRepository users;

    public UserController(UserAccountRepository users) { this.users = users; }

    @GetMapping
    UserResponse me(Authentication authentication) {
        var user = users.findById(CurrentUser.id(authentication)).orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "사용자를 찾지 못했습니다."));
        return new UserResponse(user.getId(), user.getGithubLogin(), user.getDisplayName(), user.getAvatarUrl());
    }

    record UserResponse(UUID id, String githubLogin, String displayName, String avatarUrl) { }
}
