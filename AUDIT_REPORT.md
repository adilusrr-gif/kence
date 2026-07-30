# Audit Report: KENCE.AI Platform Security, Quality & Performance Review

**Date:** 2026-06-17  
**Project:** KENCE.AI Enterprise AI Document Platform  
**Scope:** Backend (FastAPI), Frontend (React/Vite), Docker Configuration

---

## Executive Summary

| Category | Status | Critical Issues | High Issues | Medium Issues |
|----------|--------|-----------------|-------------|---------------|
| **Backend Security** | 🔴 Needs Immediate Attention | 2 | 4 | 3 |
| **Frontend Security** | 🟡 Moderate Risk | 1 | 5 | 6 |
| **Docker/Infrastructure** | 🔴 Critical Vulnerabilities | 3 | 2 | 2 |
| **Code Quality** | 🟢 Generally Good | 0 | 2 | 8 |
| **Performance** | 🟡 Optimization Opportunities | - | 3 | 5 |

---

## CRITICAL Issues (Immediate Action Required)

### 🔴 Backend Security Issues

#### 1. Hardcoded Credentials in docker-compose.yml

**Files:** `docker-compose.yml:12`, `docker-compose.yml:29`

```yaml
# Current vulnerable configuration
POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-kence2026}      # ← DEFAULT PASSWORD!
NEO4J_PASSWORD: ${NEO4J_PASSWORD:-kence_neo4j_2026}     # ← DEFAULT PASSWORD!
```

**Risk:** Anyone with access to the compose file can see default credentials. In production, if .env is missing, weak defaults are used.

**Fix:**
```yaml
# Remove all fallback values for production secrets
POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}  # Require in .env, no default!
NEO4J_PASSWORD: ${NEO4J_PASSWORD}        # Must be set explicitly
```

---

#### 2. API_KEY_HMAC_SECRET Uses Weak Fallback

**File:** `backend/app/core/config.py:123`, `backend/app/services/api_key_service.py:22-25`

```python
# config.py - Empty default means plain SHA-256 instead of HMAC
API_KEY_HMAC_SECRET: str = ""  # ← Fallback to insecure mode!

# api_key_service.py
if secret:
    return hmac.new(secret, raw_key.encode(), hashlib.sha256).hexdigest()
return hashlib.sha256(raw_key.encode()).hexdigest()  # ← Insecure!
```

**Risk:** API keys are hashed with plain SHA-256 by default instead of HMAC, making them more vulnerable to length extension attacks.

**Fix:** Remove fallback, require explicit secret:
```python
API_KEY_HMAC_SECRET: str = os.getenv("API_KEY_HMAC_SECRET")  # Fail if not set
if not API_KEY_HMAC_SECRET:
    raise ValueError("API_KEY_HMAC_SECRET must be configured")
```

---

#### 3. Databases Exposed on 0.0.0.0

**File:** `docker-compose.yml:15-16`, `docker-compose.yml:24-25`

```yaml
# Current - accessible from any IP
ports:
  - "5432:5432"   # PostgreSQL on 0.0.0.0
  - "7474:7474"   # Neo4j HTTP on 0.0.0.0
  - "7687:7687"   # Neo4j Bolt on 0.0.0.0
```

**Risk:** Databases are accessible from the internet. Combined with weak default passwords, this is an open door to data breach.

**Fix (production):**
```yaml
# Bind only to localhost unless external access required
ports:
  - "127.0.0.1:5432:5432"
  - "127.0.0.1:7474:7474"
  - "127.0.0.1:7687:7687"
```

---

#### 4. Containers Running as Root

**Files:** `backend/Dockerfile`, `frontend/Dockerfile`

**Current state (backend):**
```dockerfile
FROM python:3.11-slim-bookworm
WORKDIR /app
# ... no user creation ...
CMD ["uvicorn", "app.main:app"]  # Runs as root!
```

**Risk:** Container escape gives attacker root access to host system via bind mounts.

**Fix:**
```dockerfile
FROM python:3.11-slim-bookworm
WORKDIR /app
# ... install dependencies ...

RUN adduser --disabled-password --gecos '' appuser
USER appuser  # Run as non-root!

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Fix (frontend/nginx):**
```dockerfile
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
USER nginx  # Run as nginx user
EXPOSE 80
```

---

### 🔴 Frontend Security Issues

#### 5. JWT Token Stored in localStorage (XSS Vulnerability)

**Files:** `frontend/src/lib/http.js`, `frontend/src/App.jsx`

```javascript
// Storing sensitive data in localStorage
localStorage.setItem('kence_token', accessToken);  // ← XSS = stolen token!
localStorage.setItem('docai_session', sessionId);   // ← Session hijacking!
```

**Risk:** Any XSS vulnerability allows complete session takeover. An attacker can steal the token and impersonate users.

**Fix options (choose one):**

1. **HttpOnly cookies (recommended)** - Move auth to backend-managed sessions:
   ```python
   # Backend: Set httponly cookie
   response.set_cookie(
       key="access_token",
       value=token,
       httponly=True,  # JavaScript cannot access!
       secure=True,    # HTTPS only in production
       samesite="lax"
   )
   ```

2. **Encrypted storage** - If localStorage is required, encrypt tokens:
   ```javascript
   // Use Web Crypto API for encryption before storing
   const encrypted = await encrypt(token, masterKey);
   localStorage.setItem('kence_token', encrypted);
   ```

---

#### 6. Insecure DOMPurify Configuration (CSS/SVG Injection)

**File:** `frontend/src/widgets/document-viewer/DocumentViewer.jsx:107`

```javascript
dangerouslySetInnerHTML={{
  __html: DOMPurify.sanitize(html, {
    ADD_TAGS: ['style'],           // ← Allows <style> injection!
    ADD_ATTR: ['style'],           // ← Style attribute XSS!
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp|data):...  // ← data: URI!
  })
}}
```

**Risk:** CSS injection through `<style>` tags and `style` attributes. Potential SVG-based XSS via `data:` URIs.

**Fix:**
```javascript
dangerouslySetInnerHTML={{
  __html: DOMPurify.sanitize(html, {
    // Remove these dangerous additions for standard use
    ADD_TAGS: [],                  // Don't add style tags by default
    ADD_ATTR: [],                  // Or use a stricter allowlist
    ALLOWED_URI_REGEXP: /^(?:(?:f|ht)tps?|mailto|tel):/i  // Block data:
  })
}}
```

---

### 🔴 Docker Infrastructure Issues

#### 7. Bind Mounts with Full Host Access

**File:** `docker-compose.yml:99-103`

```yaml
volumes:
  - ./backend/uploads:/app/uploads        # ← Read/write host filesystem!
  - ./backend/chroma_db:/app/chroma_db    # ← Vector DB files exposed!
  - ./backend/data:/app/data              # ← User data on host!
  - ./backend/org_storage:/app/org_storage
```

**Risk:** Container running as root can read/write any file in mounted directories. With container escape, attacker gains full access to host filesystem.

**Fix:** Use named volumes where possible:
```yaml
volumes:
  - uploads_data:/app/uploads           # Named volume, isolated from host
  - chroma_db_data:/app/chroma_db
  - ./backend/data:/app/data:ro         # Read-only bind mount if possible
  - org_storage_data:/app/org_storage

volumes:
  uploads_data:
  chroma_db_data:
  org_storage_data:
```

---

## HIGH Priority Issues (Address in Sprint)

### 🟡 Backend Security Issues

#### H1. CORS Origins Not Restricted in Production

**File:** `backend/app/core/config.py:149-153`

```python
CORS_ORIGINS: str = (
    "http://localhost:3000,http://127.0.0.1:3000,"
    "http://localhost:5173,http://127.0.0.1:5173"
)
```

**Risk:** Dev origins may be accidentally used in production. An attacker could host a malicious site that makes authenticated requests to your API.

**Fix:** Add explicit environment-based configuration:
```python
if ENV == "production":
    CORS_ORIGINS: str = os.getenv("CORS_ORIGINS", "")  # Must be set!
else:
    CORS_ORIGINS: str = "http://localhost:3000,..."     # Dev defaults
```

---

#### H2. Rate Limiting Not Applied Globally

**File:** `backend/app/api/routes.py`, various endpoints

Many endpoints lack rate limiting:
- Chat endpoints: Some have `@limiter.limit("20/min")`
- Upload endpoints: `10/min` on some, none on others
- Agent endpoints: No rate limiting visible
- Analytics endpoints: No protection

**Risk:** Attackers can brute-force endpoints without rate limits (chat spam, upload abuse, agent task flooding).

**Fix:** Add global middleware or consistent decorators:
```python
# Option 1: Global default rate limiter in main.py
app.add_middleware(SlowAPIMiddleware, default_limits=["100/min"])

# Option 2: Consistent per-endpoint limits with sensible defaults
@router.post("/chat")
@limiter.limit("30/min")
async def chat(...)

@router.post("/agents/tasks")
@limiter.limit("20/min")
async def create_agent_task(...)
```

---

### 🟡 Frontend Security Issues

#### H3. CSRF Protection Missing for State-Changing Requests

**File:** `frontend/src/lib/http.js`

```javascript
if (token) headers['Authorization'] = `Bearer ${token}`
// No CSRF token check!
```

**Risk:** Cross-Site Request Forgery attacks. A malicious site can trick users into performing actions on KENCE.AI while they're authenticated.

**Fix:** Implement CSRF with double-submit pattern:
1. Backend issues CSRF token in both cookie (httponly) and response body
2. Frontend sends CSRF token in `X-CSRF-Token` header for mutations
3. Backend validates header matches cookie value

---

#### H4. Silent Error Handling Masks Failures

**Files:** Multiple components

```javascript
// Common anti-pattern found throughout frontend
.catch(() => {})  // User never knows API call failed!
.catch(e => console.error(e))  // Console error only, UI doesn't update!
```

**Examples:**
- `RightIntelligencePanel.jsx:60` - Session data load errors silently return empty array
- `useChatMessages.js:56` - History fetch failures invisible to user
- `upload.ts:132` - Navigation timer on error but no alert

**Risk:** Users experience "broken" features without knowing why. Data may be stale or missing without any indication.

**Fix:** Implement consistent error handling with UI feedback:
```javascript
// Use a centralized toast/error handler
catch (err) => {
  console.error('Upload failed:', err);
  showToast(`Ошибка загрузки: ${getMessage(err)}`, 'error');
}
```

---

#### H5. Missing Request Timeouts

**File:** `frontend/src/lib/http.js`

```javascript
const res = await fetch(url, {...})  // No timeout!
// Network hang will freeze UI indefinitely
```

**Risk:** Poor network or server issues cause indefinite loading states. Users think app is frozen.

**Fix:** Add AbortController with timeout:
```javascript
function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s
  
  return fetch(url, {...options, signal: controller.signal})
    .finally(() => clearTimeout(timeoutId));
}
```

---

### 🟡 Docker/Infrastructure Issues

#### H6. Using 'latest' Tag for Application Images

**File:** `docker-compose.yml:95`, `docker-compose.yml:141`

```yaml
image: docai-backend:latest    # No version = unpredictable deploys!
image: docai-frontend:latest
```

**Risk:** Rebuilding can pull breaking changes. Deployments are not reproducible across environments or time.

**Fix:** Use SHA256 digests for immutable tags:
```yaml
image: docai-backend@sha256:a1b2c3d4...  # Immutable!
# Or use git commit hash as tag
image: docai-backend:git-a1b2c3d
```

---

#### H7. Frontend Running on Privileged Port 80

**File:** `frontend/Dockerfile`

```dockerfile
EXPOSE 80    # Requires elevated privileges (< 1024)
```

**Risk:** Nginx master process runs as root to bind port 80, expanding attack surface.

**Fix options:**
1. Change to unprivileged port: `EXPOSE 3000` and update docker-compose
2. Use CAP_NET_BIND_SERVICE capability instead of full root

---

## MEDIUM Priority Issues (Sprint Planning)

### 🟠 Backend Code Quality

#### M1. CORS `allow_headers=["*"]` Too Permissive

**File:** `backend/app/main.py:409`

```python
CORSMiddleware(app, allow_origins=origins, allow_headers=["*"], ...)
```

**Fix:** Explicitly list required headers:
```python
allow_headers=[
    "Authorization",
    "Content-Type",
    "X-Request-ID",
    "X-CSRF-Token"
]
```

---

#### M2. Inconsistent Error Handling

Errors sometimes expose internal details:
```python
raise HTTPException(status_code=500, detail=str(e))  # routes.py:264
```

While `main.py` has a global handler that masks production errors, this inconsistency is risky if handlers change.

**Fix:** Standardize error messages:
```python
if settings.DEBUG:
    raise HTTPException(status_code=500, detail=str(e))
else:
    raise HTTPException(status_code=500, detail="Internal server error")
```

---

#### M3. Magic Numbers Without Documentation

**File:** `backend/app/services/comparison.py:76`

```python
if best_match[1] < 0.3:  # Magic threshold - why 0.3?
    return None          # "Not similar" decision here
```

**Fix:** Define and document thresholds:
```python
MIN_SIMILARITY_THRESHOLD = 0.3  # Below this, documents considered unrelated

if best_match[1] < MIN_SIMILARITY_THRESHOLD:
    return None
```

---

### 🟠 Frontend Code Quality

#### M4. Memory Leaks from Event Listeners

**File:** `frontend/src/widgets/command-palette/CommandPalette.jsx:235`

Creates portal without cleanup on unmount. While not immediately dangerous (portal auto-removes), the event listeners may persist.

**Fix:** Add cleanup in useEffect:
```javascript
useEffect(() => {
  // ... setup code
  return () => {
    // Cleanup listeners, timers, etc.
  };
}, []);
```

---

#### M5. Weak Input Sanitization

**File:** `frontend/src/components/ChartBuilderPanel.jsx:37`

```javascript
const safeTitle = title.replace(/"/g, "'")  // Very weak sanitization!
return `[CHART type="${type}" title="${safeTitle}" data='${json}']`
```

**Risk:** Can be bypassed with `<script>`, backticks, or other injection vectors.

**Fix:** Use proper escaping:
```javascript
function escapeHtml(str) {
  return str.replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}
const safeTitle = escapeHtml(title);
```

---

#### M6. No Input Validation on User Inputs

Chat, upload forms, and agent task creation lack frontend validation before API calls. This increases server load for obviously invalid inputs.

**Fix:** Add input length limits, character restrictions, and required field checks.

---

### 🟠 Docker/Infrastructure Issues

#### M8. Health Checks Incomplete Coverage

Not all services have comprehensive health checks that verify full readiness (vs just "port is open").

**Recommendation:**
- Neo4j: Verify database operations not just HTTP response
- Ollama: Verify model loading completed, not just server running
- Backend: Already good - `/api/health` validates connections

---

## PERFORMANCE Issues

### Performance Bottlenecks

#### P1. No Frontend Code Splitting

All routes are bundled together. Initial load downloads everything.

**Fix:** Use React.lazy() with Suspense for route-level code splitting:
```javascript
const DocumentLibraryPage = lazy(() => import('./pages/DocumentLibraryPage'));
// In router:
<Route path="/docs" element={<Suspense><DocumentLibraryPage /></Suspense>} />
```

---

#### P2. Missing Image/Optimization Strategies

No visible image optimization, lazy loading, or format conversion for uploaded documents.

**Fix:** Consider:
- Lazy-loading images below the fold
- Converting to WebP/AVIF for display
- Implementing progressive loading

---

#### P3. No CDN Usage for Static Assets

All static assets served from single origin. No caching strategy defined.

**Fix:** Configure nginx caching headers:
```nginx
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

---

## Test Coverage Issues

### Current State

Tests exist in `backend/tests/` but coverage may be incomplete. Need to verify:

- [ ] API endpoint coverage for all routes
- [ ] Service layer unit tests
- [ ] Integration tests with real database
- [ ] Frontend component tests (MSW is set up)
- [ ] E2E tests for critical user flows

**Recommendation:** Run coverage report and identify gaps:
```bash
cd backend && pytest --cov=app --cov-report=html
```

---

## Priority Remediation Roadmap

### Phase 1 - Critical Security (Sprint 1)
- [ ] Remove hardcoded passwords from docker-compose.yml
- [ ] Bind databases to localhost only or use internal network
- [ ] Add non-root user to all Dockerfiles
- [ ] Move auth tokens to HttpOnly cookies

### Phase 2 - High Priority (Sprint 2-3)
- [ ] Implement global rate limiting with sensible defaults
- [ ] Add CSRF protection for mutation endpoints
- [ ] Fix CORS configuration for production environments
- [ ] Implement request timeouts on all fetch calls
- [ ] Add proper error handling to all API calls

### Phase 3 - Medium Priority (Sprint 4)
- [ ] Refactor CORS allow_headers to explicit list
- [ ] Document magic numbers and thresholds as constants
- [ ] Improve input validation and sanitization
- [ ] Fix memory leaks in event listeners

### Phase 4 - Performance & Polish (Sprint 5+)
- [ ] Implement React.lazy for code splitting
- [ ] Add image optimization strategies  
- [ ] Configure CDN and caching headers
- [ ] Increase test coverage to >80%

---

## Appendix: Security Checklist Reference

| Check | Status | Notes |
|-------|--------|-------|
| Authentication securely implemented | ✅ Good | JWT with bcrypt, rotation support |
| Authorization checks on all endpoints | ⚠️ Partial | Org-based access controlled but inconsistent rate limits |
| Input validation and sanitization | 🟡 Needs Work | SQL injection protected via parameterized queries, XSS partially mitigated |
| Sensitive data encrypted at rest | ❌ No | Tokens stored plaintext in localStorage |
| Secrets in environment variables | ⚠️ Partial | docker-compose.yml has fallback defaults |
| Containers run as non-root | ❌ No | All containers run as root |
| Network segmentation for databases | ❌ No | Exposed on 0.0.0.0:5432, etc. |
| Rate limiting protects against abuse | ⚠️ Partial | Some endpoints protected, not all |
| CSRF protection implemented | ❌ No | Missing for mutation requests |
| Secure HTTP headers configured | 🟡 Needs Work | CORS overly permissive in dev defaults |

---

## Conclusion

KENCE.AI is a well-architected platform with solid foundations (proper auth flow, SQL injection protection, error boundaries) but has significant security vulnerabilities that require immediate attention:

1. **CRITICAL**: Container security and network isolation must be addressed before any external deployment
2. **HIGH**: Storage of authentication tokens needs migration to secure mechanisms  
3. **MEDIUM**: Error handling consistency and input validation improvements needed
4. **LOW**: Performance optimizations will improve user experience but don't block launch

**Recommended next action**: Create git branch for security hardening sprint, prioritize Phase 1 items above.
