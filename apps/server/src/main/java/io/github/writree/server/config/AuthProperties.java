package io.github.writree.server.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("writree.auth")
public record AuthProperties(
        String jwtSecret,
        String desktopRedirect,
        long accessTokenMinutes,
        long refreshTokenDays,
        long loginCodeSeconds
) {
}
