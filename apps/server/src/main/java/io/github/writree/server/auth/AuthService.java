package io.github.writree.server.auth;

import io.github.writree.server.config.AuthProperties;
import io.github.writree.server.user.UserAccount;
import io.github.writree.server.web.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.HexFormat;

@Service
public class AuthService {
    private final LoginCodeRepository loginCodes;
    private final RefreshTokenRepository refreshTokens;
    private final DeviceRepository devices;
    private final TokenService tokens;
    private final AuthProperties properties;
    private final SecureRandom random = new SecureRandom();

    public AuthService(LoginCodeRepository loginCodes, RefreshTokenRepository refreshTokens, DeviceRepository devices, TokenService tokens, AuthProperties properties) {
        this.loginCodes = loginCodes;
        this.refreshTokens = refreshTokens;
        this.devices = devices;
        this.tokens = tokens;
        this.properties = properties;
    }

    @Transactional
    public String createLoginCode(UserAccount user) {
        String raw = randomToken();
        loginCodes.save(LoginCode.create(user, hash(raw), Instant.now().plus(properties.loginCodeSeconds(), ChronoUnit.SECONDS)));
        return raw;
    }

    @Transactional
    public TokenPair exchange(String code, String externalDeviceId, String deviceName) {
        var now = Instant.now();
        var loginCode = loginCodes.findByCodeHash(hash(code)).orElseThrow(() -> invalidGrant("로그인 코드가 올바르지 않습니다."));
        if (!loginCode.canConsume(now)) throw invalidGrant("로그인 코드가 만료되었거나 이미 사용되었습니다.");
        loginCode.consume(now);
        var device = devices.findByUserIdAndExternalId(loginCode.getUser().getId(), externalDeviceId)
                .map(existing -> { existing.touch(deviceName); return existing; })
                .orElseGet(() -> Device.create(loginCode.getUser(), externalDeviceId, deviceName));
        devices.save(device);
        return issue(loginCode.getUser(), device);
    }

    @Transactional
    public TokenPair refresh(String rawToken) {
        var now = Instant.now();
        var stored = refreshTokens.findByTokenHash(hash(rawToken)).orElseThrow(() -> invalidGrant("Refresh token이 올바르지 않습니다."));
        if (!stored.isActive(now)) throw invalidGrant("Refresh token이 만료되었거나 폐기되었습니다.");
        stored.revoke(now);
        stored.getDevice().touch("Writree desktop");
        return issue(stored.getUser(), stored.getDevice());
    }

    @Transactional
    public void logout(String rawToken) {
        refreshTokens.findByTokenHash(hash(rawToken)).ifPresent(token -> token.revoke(Instant.now()));
    }

    private TokenPair issue(UserAccount user, Device device) {
        String rawRefresh = randomToken();
        refreshTokens.save(RefreshToken.create(user, device, hash(rawRefresh), Instant.now().plus(properties.refreshTokenDays(), ChronoUnit.DAYS)));
        return new TokenPair(tokens.issueAccessToken(user.getId()), rawRefresh, tokens.accessTokenSeconds());
    }

    @Scheduled(cron = "0 17 3 * * *")
    @Transactional
    public void removeExpiredCredentials() {
        var now = Instant.now();
        loginCodes.deleteByExpiresAtBefore(now);
        refreshTokens.deleteByExpiresAtBefore(now.minus(7, ChronoUnit.DAYS));
    }

    private String randomToken() {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    static String hash(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }

    private ApiException invalidGrant(String message) { return new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_GRANT", message); }

    public record TokenPair(String accessToken, String refreshToken, long expiresIn) {
    }
}
