package io.github.writree.server.auth;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
    private final AuthService auth;

    public AuthController(AuthService auth) { this.auth = auth; }

    @PostMapping("/exchange")
    AuthService.TokenPair exchange(@Valid @RequestBody ExchangeRequest request) {
        return auth.exchange(request.code(), request.deviceId(), request.deviceName());
    }

    @PostMapping("/refresh")
    AuthService.TokenPair refresh(@Valid @RequestBody RefreshRequest request) {
        return auth.refresh(request.refreshToken());
    }

    @DeleteMapping("/session")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void logout(@Valid @RequestBody RefreshRequest request) {
        auth.logout(request.refreshToken());
    }

    record ExchangeRequest(@NotBlank String code, @NotBlank @Size(max = 255) String deviceId, @NotBlank @Size(max = 255) String deviceName) { }
    record RefreshRequest(@NotBlank String refreshToken) { }
}
