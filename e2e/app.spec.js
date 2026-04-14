// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('API expuesta al cliente', () => {
  test('GET /api/health devuelve ok', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.at).toBe('string');
  });

  test('GET /api/config expone claves esperadas', async ({ request }) => {
    const res = await request.get('/api/config');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('supabaseUrl');
    expect(body).toHaveProperty('supabaseAnonKey');
  });

  test('GET /api/auth/username-available rechaza nombre demasiado corto', async ({ request }) => {
    const res = await request.get('/api/auth/username-available?username=a');
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.available).toBe(false);
    expect(body.error).toBeTruthy();
  });

  test('GET /api/ruta-inexistente sin token → 401 (requireAuth antes de 404)', async ({
    request,
  }) => {
    const res = await request.get('/api/__playwright_missing_route__');
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  test('POST /api/register sin datos → 400', async ({ request }) => {
    const res = await request.post('/api/register', {
      headers: { 'Content-Type': 'application/json' },
      data: '{}',
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });
});

test.describe('Rutas SPA', () => {
  test('GET / responde 200 con HTML o 503 sin build', async ({ page }) => {
    const response = await page.goto('/');
    expect(response).toBeTruthy();
    const status = response.status();
    expect([200, 503]).toContain(status);
    if (status === 200) {
      await expect(page.locator('body')).toBeVisible();
    } else {
      await expect(page.getByText(/No hay build del frontend/i)).toBeVisible();
    }
  });

  test('GET /dashboard y /join/:code mismas reglas que la raíz', async ({ page }) => {
    for (const path of ['/dashboard', '/join/e2e-test']) {
      const response = await page.goto(path);
      expect(response).toBeTruthy();
      expect([200, 503]).toContain(response.status());
    }
  });
});
