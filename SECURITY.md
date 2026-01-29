# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability within this project, please send an email to the project maintainers. All security vulnerabilities will be promptly addressed.

**Please do not report security vulnerabilities through public GitHub issues.**

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Time

- Initial response: Within 48 hours
- Fix timeline: Depends on severity (critical issues will be prioritized)

## Security Best Practices

This project follows these security practices:

1. **Authentication**: JWT tokens stored in HTTP-only cookies
2. **Password Security**: Bcrypt hashing with salt rounds ≥ 10
3. **Input Validation**: Zod schemas for all user inputs
4. **Database Security**: Prisma ORM prevents SQL injection
5. **Dependencies**: Regular security audits via `npm audit`
6. **HTTPS**: Secure cookies in production
7. **CORS**: Proper CORS configuration
8. **Environment Variables**: Sensitive data in `.env` files (not committed)

## Automated Security Checks

This project uses GitHub Actions to:

- Run `npm audit` on every PR
- Check for vulnerable dependencies
- Validate security configurations
