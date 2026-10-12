package io.github.writree.server.auth;

import io.github.writree.server.config.AuthProperties;
import io.github.writree.server.user.UserAccount;
import io.github.writree.server.user.UserAccountRepository;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.util.UriComponentsBuilder;

import java.io.IOException;

@Component
public class GithubLoginSuccessHandler implements AuthenticationSuccessHandler {
    private final UserAccountRepository users;
    private final AuthService authService;
    private final AuthProperties properties;

    public GithubLoginSuccessHandler(UserAccountRepository users, AuthService authService, AuthProperties properties) {
        this.users = users;
        this.authService = authService;
        this.properties = properties;
    }

    @Override
    @Transactional
    public void onAuthenticationSuccess(HttpServletRequest request, HttpServletResponse response, Authentication authentication) throws IOException, ServletException {
        var token = (OAuth2AuthenticationToken) authentication;
        OAuth2User principal = token.getPrincipal();
        Number githubIdValue = principal.getAttribute("id");
        String login = principal.getAttribute("login");
        if (githubIdValue == null || login == null) throw new ServletException("GitHub did not return a user id and login");
        long githubId = githubIdValue.longValue();
        String displayName = principal.getAttribute("name");
        String avatarUrl = principal.getAttribute("avatar_url");
        UserAccount user = users.findByGithubId(githubId).orElseGet(() -> UserAccount.create(githubId, login, displayName, avatarUrl));
        user.updateProfile(login, displayName, avatarUrl);
        users.save(user);
        String code = authService.createLoginCode(user);
        String redirect = UriComponentsBuilder.fromUriString(properties.desktopRedirect()).queryParam("code", code).build(true).toUriString();
        response.sendRedirect(redirect);
    }
}
