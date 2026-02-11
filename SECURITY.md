# Security Policy

## Supported Versions

| Version | Supported          |
|---------|-------------------|
| Latest  | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it responsibly. We take security seriously and appreciate your help in keeping this project safe.

### How to Report

1. **Do not** open a public issue or discussion about the vulnerability.
2. Send an email to: `support@avidity.studio`
3. Include as much detail as possible:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if known)

### What to Expect

- We will acknowledge receipt of your report within 48 hours
- We will provide a detailed response within 7 days indicating the next steps
- We will work with you to understand and validate the issue
- Once validated, we will work on a fix and coordinate disclosure

### Disclosure Policy

We follow responsible disclosure practices:
- We will keep you informed of our progress
- We will credit you in the security advisory (unless you prefer anonymity)
- We will aim to release a fix within a reasonable timeframe based on severity
- Public disclosure will occur after a fix has been released

## Security Best Practices

### For Users

- **Keep Updated**: Always use the latest version of the application
- **Verify Downloads**: Only download from official sources
- **File Permissions**: Ensure proper file permissions on your markdown files
- **Local Storage**: This application stores data locally; ensure your system is secure

### For Developers

- **Dependencies**: Regularly update dependencies and review security advisories
- **Code Review**: All code changes should undergo security review
- **Testing**: Run security tests before merging changes
- **Secrets**: Never commit secrets, API keys, or sensitive data

## Project-Specific Security Considerations

### Tauri Application

This application uses Tauri, which provides several security features:

- **Sandboxed Backend**: Rust code runs in a sandboxed environment
- **IPC Communication**: All frontend-backend communication goes through secure IPC
- **File System Access**: File operations are controlled through Tauri's permission system
- **No Remote Code**: The application does not execute remote code

### Known Security Features

- Content Security Policy (CSP) configured for the webview
- File access restricted to user-selected directories
- No network requests to external servers (unless explicitly added)
- Input sanitization for markdown rendering

## Dependency Security

We regularly audit our dependencies for known vulnerabilities:

- **npm packages**: Audited via `npm audit`
- **Rust crates**: Audited via `cargo audit`
- **GitHub Dependabot**: Enabled for automated dependency updates

## Security Resources

- [Tauri Security Documentation](https://tauri.app/v1/guides/security/)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [GitHub Security Advisories](https://github.com/advisories)

## License

This security policy is part of the project and follows the same license terms as the main project.
