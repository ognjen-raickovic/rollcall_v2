import { test, expect } from '@playwright/test'

async function signIn(page, user = '1') {
  // Legacy event journeys explicitly enter development-only demo mode.
  if (!new URL(page.url()).pathname.startsWith('/demo/login')) {
    await page.getByRole('link', { name: 'Development demo players' }).click()
  }
  await page.locator(`label:has(input[name="demo-user"][value="${user}"])`).click()
  await page.locator('button[type="submit"]').click()
  await expect(page.locator('input[name="demo-user"]')).toHaveCount(0)
}

async function chooseCity(page, prefix, query, name, keyboard = false) {
  const field = page.locator(`#${prefix}-city`)
  await field.fill(query)
  const option = page.getByRole('option', { name: new RegExp(`^${name}(?:\\s|$)`) }).first()
  await expect(option).toBeVisible()
  const id = (await option.getAttribute('id')).split('-option-')[1]
  if (keyboard) {
    await page.mouse.move(0, 0)
    await field.press('Escape')
    await field.press('ArrowDown')
    await expect(field).toHaveAttribute('aria-activedescendant', await option.getAttribute('id'))
    await field.press('Enter')
  } else await option.click()
  await expect(field).toHaveValue(name)
  await expect(field).toHaveAttribute('aria-expanded', 'false')
  return id
}

test.beforeEach(async ({ page }, info) => {
  await page.addInitScript(
    (theme) => localStorage.setItem('rollcall.theme', theme),
    info.project.metadata.theme,
  )
})

test('homepage location search bridges legacy fixtures and legacy editing requires confirmation', async ({
  page,
}, info) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.goto('/')
  await expect(page.locator('#home-location-country')).toBeEnabled()
  await expect(page.locator('article')).toHaveCount(3)
  await expect(page.getByRole('heading', { name: 'Good games. Better company.' })).toBeVisible()
  await page.screenshot({ path: info.outputPath('homepage.png'), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.locator('#home-location-country').selectOption('ME')
  const id = await chooseCity(page, 'home-location', 'Niksic', 'Nikšić')
  await page.locator('#discovery-search').fill('Commander')
  await page.getByRole('button', { name: 'Find events', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`cityId=${id}`))
  await expect(page.getByRole('link', { name: 'Commander night in Niksic', exact: true })).toBeVisible()
  await expect(page.locator('article')).toHaveCount(1)
  await page.getByRole('link', { name: 'Reset filters', exact: true }).click()
  await page.getByRole('link', { name: 'First adventure: D&D in Podgorica', exact: true }).click()
  await expect(page.getByText('18 Bokeska Street', { exact: true })).toHaveCount(0)
  await page.getByRole('link', { name: 'Log in', exact: true }).click()
  await signIn(page)
  await page.getByRole('link', { name: /^Edit event$/i }).click()
  await expect(page.locator('#event-location-city')).toHaveValue('Podgorica')
  await expect(
    page.getByText('Confirm the existing location by choosing a city from the suggestions.'),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.locator('#event-location-city')).toHaveAttribute('aria-invalid', 'true')
  await chooseCity(page, 'event-location', 'Podgorica', 'Podgorica')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page).toHaveURL(/\/events\/1$/)
  expect(errors).toEqual([])
})

test('four-country creation, optional venue, discovery history, editing and participation', async ({
  page,
}, info) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.goto('/login')
  await signIn(page)
  const events = {}
  for (const [code, query, city, country] of [
    ['ME', 'Podgorica', 'Podgorica', 'Montenegro'],
    ['RS', 'Beograd', 'Belgrade', 'Serbia'],
    ['BA', 'Sarajevo', 'Sarajevo', 'Bosnia and Herzegovina'],
    ['HR', 'Zagreb', 'Zagreb', 'Croatia'],
  ]) {
    await page.getByRole('link', { name: 'Host an event', exact: true }).first().click()
    await expect(page.locator('#event-location-country')).toBeEnabled()
    await expect(page.locator('#event-location-country option')).toHaveCount(5)
    await page.locator('#event-title').fill(`Location journey ${code}`)
    await page
      .locator('#event-description')
      .fill('A friendly workshop table created to verify selected geographic locations.')
    await page.locator('#event-gameId').selectOption('1')
    await page.locator('#event-address').fill(`Private workshop address ${code}`)
    const start = new Date(Date.now() + 7 * 86400000)
    await page.locator('#event-startsAt').fill(start.toISOString().slice(0, 16))
    await page.locator('#event-endsAt').fill(new Date(start.getTime() + 7200000).toISOString().slice(0, 16))
    await page.locator('#event-location-country').selectOption(code)
    if (code === 'ME') {
      await page.locator('#event-location-city').fill('Podgorica')
      await page.getByRole('button', { name: 'Create Event', exact: true }).click()
      await expect(page).toHaveURL(/\/events\/new$/)
      await expect(page.locator('#event-location-city')).toHaveAttribute('aria-invalid', 'true')
    }
    const cityId = await chooseCity(page, 'event-location', query, city, code === 'ME')
    await expect(page.locator('#event-venue')).toHaveValue('')
    if (code === 'ME') {
      await page.locator('#event-location-city').scrollIntoViewIfNeeded()
      await page.screenshot({ path: info.outputPath('create-location.png') })
    }
    await page.getByRole('button', { name: 'Create Event', exact: true }).click()
    await expect(page.getByRole('heading', { name: `Location journey ${code}`, exact: true })).toBeVisible()
    await expect(page.getByText(`${city}, ${country}`, { exact: true }).first()).toBeVisible()
    events[code] = { path: new URL(page.url()).pathname, cityId, city }
  }
  await page.getByRole('link', { name: 'Explore events', exact: true }).first().click()
  for (const code of ['ME', 'RS', 'BA', 'HR']) {
    await page.locator('#filter-location-country').selectOption(code)
    await expect(page.locator('#filter-location-city')).toHaveValue('')
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`country=${code}`))
    await expect(page.getByRole('link', { name: `Location journey ${code}`, exact: true })).toBeVisible()
  }
  await page.locator('#filter-location-country').selectOption('RS')
  const selected = await chooseCity(page, 'filter-location', 'Beograd', 'Belgrade')
  expect(selected).toBe(events.RS.cityId)
  await page.locator('#event-search').fill('Location journey RS')
  await page.locator('#event-game').selectOption('1')
  await page.locator('#event-availability').selectOption('true')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`cityId=${selected}`))
  await expect(page.getByRole('link', { name: 'Location journey RS', exact: true })).toBeVisible()
  await expect(page.locator('article')).toHaveCount(1)
  await page.screenshot({ path: info.outputPath('discovery-location.png'), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('link', { name: 'Reset filters', exact: true }).click()
  await expect(page.locator('#filter-location-country')).toHaveValue('')
  await expect(page.locator('#filter-location-city')).toBeDisabled()
  await page.goBack()
  await expect(page.locator('#filter-location-country')).toHaveValue('RS')
  await expect(page.locator('#filter-location-city')).toHaveValue('Belgrade')
  await expect(page.locator('article')).toHaveCount(1)
  await page.goForward()
  await expect(page.locator('#filter-location-country')).toHaveValue('')
  await page.getByRole('link', { name: 'Location journey RS', exact: true }).click()
  await page.getByRole('link', { name: /^Edit event$/i }).click()
  await expect(page.locator('#event-location-city')).toHaveValue('Belgrade')
  await page.locator('#event-location-country').selectOption('HR')
  await expect(page.locator('#event-location-city')).toHaveValue('')
  await expect(page.getByText(/^Selected:/)).toHaveCount(0)
  await chooseCity(page, 'event-location', 'Zagreb', 'Zagreb')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Location journey RS', exact: true })).toBeVisible()
  await expect(page.getByText('Zagreb, Croatia', { exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Log out', exact: true }).click()
  await expect(page.getByText('Private workshop address RS', { exact: true })).toHaveCount(0)
  await expect(
    page.getByText('Exact address is shared with the host and confirmed participants.'),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Log in to join', exact: true }).click()
  await signIn(page, '2')
  await page.getByRole('button', { name: 'Join Event', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Leave Event', exact: true })).toBeVisible()
  await expect(page.getByText('Private workshop address RS', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Leave Event', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Join Event', exact: true })).toBeVisible()
  await expect(page.getByText('Private workshop address RS', { exact: true })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('country retry, city retry, aliases, keyboard, debounce and stale responses', async ({ page }, info) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  let countryRequests = 0
  let failCountries = true
  let failCities = true
  await page.route('**/api/countries', async (route) => {
    countryRequests++
    if (failCountries) await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
    else await route.continue()
  })
  let delayedStarted
  const delayedRequest = new Promise((resolve) => {
    delayedStarted = resolve
  })
  await page.route('**/api/cities?*', async (route) => {
    const q = new URL(route.request().url()).searchParams.get('q')
    if (q === 'RetryCheck' && failCities)
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
    else if (q === 'Pod') {
      const response = await route.fetch()
      delayedStarted()
      await new Promise((resolve) => setTimeout(resolve, 800))
      await route.fulfill({ response }).catch(() => {})
    } else await route.continue()
  })
  await page.goto('/events')
  await expect(page.getByRole('button', { name: 'Retry countries' })).toBeVisible()
  await expect(page.locator('article')).toHaveCount(7)
  const failedAttempts = countryRequests
  failCountries = false
  await page.getByRole('button', { name: 'Retry countries' }).click()
  await expect(page.locator('#filter-location-country')).toBeEnabled()
  await expect(page.locator('#filter-location-country option')).toHaveCount(5)
  expect(countryRequests).toBe(failedAttempts + 1)
  await page.locator('#filter-location-country').selectOption('ME')
  const city = page.locator('#filter-location-city')
  await city.focus()
  await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(4)
  await city.press('ArrowUp')
  await expect(city).toHaveAttribute('aria-activedescendant', /option-\d+$/)
  await city.press('Escape')
  await expect(city).toHaveAttribute('aria-expanded', 'false')
  await city.click()
  await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(4)
  await page.screenshot({ path: info.outputPath('city-options.png') })
  await city.fill('NoRollCallPlaceAtAll')
  await expect(page.getByText('No cities match this search. Try another spelling.')).toBeVisible()
  await city.fill('RetryCheck')
  await expect(page.getByRole('button', { name: 'Retry cities' })).toBeVisible()
  failCities = false
  await page.getByRole('button', { name: 'Retry cities' }).click()
  await expect(page.getByText('No cities match this search. Try another spelling.')).toBeVisible()
  await city.fill('Pod')
  await delayedRequest
  await city.fill('Niksic')
  await expect(page.getByRole('option', { name: /^Nikšić\s/ }).first()).toBeVisible()
  await page.waitForTimeout(900)
  await expect(city).toHaveValue('Niksic')
  await expect(page.getByRole('option', { name: /^Podgorica\s/ })).toHaveCount(0)
  await chooseCity(page, 'filter-location', 'Niksic', 'Nikšić', true)
  await page.locator('#filter-location-country').selectOption('RS')
  await expect(city).toHaveValue('')
  const calls = []
  page.on('request', (request) => {
    if (request.url().includes('/api/cities?')) calls.push(new URL(request.url()).searchParams.get('q'))
  })
  await city.fill('C')
  await city.fill('Ca')
  await city.fill('Cacak')
  await expect(page.getByRole('option', { name: /^Čačak\s/ }).first()).toBeVisible()
  expect(calls.filter((q) => q === 'C' || q === 'Ca')).toEqual([])
  await chooseCity(page, 'filter-location', 'Чачак', 'Čačak')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(errors).toEqual([])
})
