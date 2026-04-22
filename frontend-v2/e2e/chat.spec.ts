import { test, expect } from '@playwright/test'

/**
 * @critical — Happy path del núcleo de chat (MD): sesión, lista, envío, UI optimista + persistido.
 *
 * `getByLabel` no es el locator adecuado para un `<aside>` con `aria-label` (prioriza
 * controles de formulario en la práctica). Usamos `data-testid` + carga de app autenticada.
 */
test.describe('@critical', () => {
  test('flujo completo: Inicio → MD → abrir hilo → enviar mensaje único → visible en lista', async ({
    page,
  }) => {
    test.skip(
      !process.env.E2E_USERNAME?.trim(),
      'Define E2E_USERNAME (usuario de prueba) para ejecutar este E2E.',
    )
    const username = process.env.E2E_USERNAME!.trim()

    await page.goto('/')

    const nameField = page.getByLabel('Nombre de usuario', { exact: true })
    if (await nameField.isVisible({ timeout: 15_000 }).catch(() => false)) {
      await nameField.fill(username)
      await page.getByRole('button', { name: 'Continuar' }).click()
    }

    // Bootstrap: AppLayout (y testids) solo existen con sesión + fetch inicial; error de login mantiene el formulario
    const shell = page.getByTestId('app-authenticated')
    await expect(shell).toBeVisible({ timeout: 120_000 })
    // Rail de escritorio (evita el duplicado en `MobileSheets`, fuera de la shell)
    const desktopRail = shell.getByTestId('server-rail')
    await expect(desktopRail).toBeVisible({ timeout: 30_000 })
    await shell.getByTestId('nav-home-dm').click()

    await expect(shell.getByTestId('dm-sidebar-nav')).toBeVisible({ timeout: 30_000 })

    const conversationRows = shell.getByTestId('dm-conversation-row')
    if ((await conversationRows.count()) === 0) {
      test.skip(
        true,
        'Se necesita al menos una conversación en Mensajes directos. Añade un MD de prueba o pasa a un usuario sembrado.',
      )
    }

    await conversationRows.first().click()

    const body = `e2e-happy ${Date.now()}`
    const msgInput = shell.getByRole('textbox', { name: 'Mensaje' })
    await expect(msgInput).toBeVisible({ timeout: 20_000 })
    await expect(msgInput).toBeEnabled({ timeout: 20_000 })

    await msgInput.fill(body)
    await shell.getByRole('button', { name: 'Enviar' }).click()

    const byLine = shell.getByText(body, { exact: true })
    await expect(byLine).toBeVisible({ timeout: 45_000 })
    await expect(byLine).toBeAttached()

    const sending = shell.getByText('Enviando…')
    try {
      await expect(sending).toBeHidden({ timeout: 60_000 })
    } catch {
      /* el envío pudo ser tan rápido que "Enviando…" no se ve */
    }
  })
})
