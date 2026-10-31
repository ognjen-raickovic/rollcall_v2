import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { build, preview } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { chromium, expect as baseExpect } from '@playwright/test'
const expect = baseExpect.configure({ timeout: 15000 })
const root = fileURLToPath(new URL('..', import.meta.url)),
  outDir = '.tmp/discussion-ui-build'
const eventId = 'e5000000-0000-4000-8000-000000000001',
  actor = '45000000-0000-4000-8000-000000000002',
  host = '45000000-0000-4000-8000-000000000001'
const time = '2030-01-01T00:00:00Z'
test(
  'discussion and review journeys, preview tabs, plain-text safety and feedback at both widths/themes',
  { timeout: 180000 },
  async () => {
    await build({
      root,
      configFile: false,
      envDir: false,
      plugins: [react(), tailwindcss()],
      resolve: { alias: { '@': path.join(root, 'src') } },
      logLevel: 'error',
      build: { outDir, emptyOutDir: true },
      define: {
        'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://synthetic-discussion.supabase.co'),
        'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(
          'sb_publishable_synthetic_discussion',
        ),
        'import.meta.env.VITE_API_ORIGIN': JSON.stringify(''),
        'import.meta.env.VITE_ENABLE_DEMO_MODE': JSON.stringify('false'),
      },
    })
    const server = await preview({
      root,
      configFile: false,
      envDir: false,
      build: { outDir },
      preview: { host: '127.0.0.1', port: 0 },
    })
    let browser
    try {
      browser = await chromium.launch({
        headless: true,
        channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
      })
      const origin = 'http://127.0.0.1:' + server.httpServer.address().port
      await mkdir(path.join(root, '.tmp/discussion-ui'), { recursive: true })
      for (const width of [375, 1440])
        for (const theme of ['dark', 'light']) {
          const context = await browser.newContext({ viewport: { width, height: 1000 } })
          const user = {
            id: actor,
            email: 'fixture@example.test',
            aud: 'authenticated',
            role: 'authenticated',
            user_metadata: {},
            app_metadata: {},
            created_at: time,
          }
          await context.addInitScript(
            ({ theme, user }) => {
              localStorage.setItem('rollcall.theme', theme)
              localStorage.setItem(
                'rollcall.auth',
                JSON.stringify({
                  user,
                  access_token: 'synthetic-discussion-token',
                  refresh_token: 'synthetic-refresh',
                  token_type: 'bearer',
                  expires_in: 3600,
                  expires_at: Math.floor(Date.now() / 1000) + 3600,
                }),
              )
            },
            { theme, user },
          )
          const page = await context.newPage(),
            errors = []
          page.on('pageerror', (e) => errors.push(e.message))
          page.on('console', (m) => {
            if (m.type() === 'error' && !/Failed to load resource.*(400|503)/.test(m.text()))
              errors.push(m.text())
          })
          let ended = false,
            failed = false,
            delayList = false,
            sequence = 1
          const items = { comments: [], reviews: [] }
          let hostMode = false,
            rejectComment = false,
            holdWrite = false,
            releaseWrite = () => {},
            writeGate = Promise.resolve(),
            rotationCalls = 0,
            revocationCalls = 0
          const toasts = page.locator('[data-notifications]')
          const dismissToasts = async () => {
            while (await toasts.getByRole('button', { name: 'Dismiss notification' }).count())
              await toasts.getByRole('button', { name: 'Dismiss notification' }).first().click()
          }
          const summary = {
            id: eventId,
            title: 'Discussion game night',
            game: { id: 1, name: 'Dungeons & Dragons', category: 'role-playing' },
            city: { id: 1, name: 'Podgorica', administrativeDivision: null },
            country: { id: 1, isoCode: 'ME', name: 'Montenegro' },
            venue: null,
            startsAt: '2035-01-01T18:00:00Z',
            endsAt: '2035-01-01T22:00:00Z',
            capacity: 5,
            participantCount: 1,
            availableSlots: 4,
            tags: [],
            visibility: 'public',
            status: 'scheduled',
            cover: { kind: 'default', imageUrl: '/images/role-playing.svg' },
          }
          function item(body, kind, parentId = null) {
            return {
              id: '55000000-0000-4000-8000-' + String(sequence++).padStart(12, '0'),
              author: { id: actor, displayName: 'Fixture Player' },
              body,
              deleted: false,
              hidden: false,
              createdAt: time,
              editedAt: null,
              canEdit: true,
              canDelete: true,
              ...(kind === 'comments' ? { parentId, isHost: false, replyCount: 0 } : { rating: 5 }),
            }
          }
          const hostComment = item('What should I bring?', 'comments')
          hostComment.author = { id: host, displayName: 'Fixture Host' }
          hostComment.isHost = true
          hostComment.canEdit = false
          hostComment.canDelete = false
          items.comments.push(hostComment)
          const hostReply = item(
            'Bring dice and a character sheet.\n' + 'A long conversation line '.repeat(12),
            'comments',
            hostComment.id,
          )
          hostReply.author = { id: host, displayName: 'HostWithALongPublicNameWithoutSpacesForWrapping' }
          hostReply.isHost = true
          hostReply.canEdit = false
          hostReply.canDelete = false
          items.comments.push(hostReply)
          hostComment.replyCount = 1
          const hiddenParent = item(null, 'comments')
          hiddenParent.hidden = true
          hiddenParent.canEdit = false
          const deletedParent = item(null, 'comments')
          deletedParent.deleted = true
          deletedParent.canEdit = false
          deletedParent.canDelete = false
          items.comments.push(
            hiddenParent,
            deletedParent,
            item('Replies remain readable beneath a hidden parent.', 'comments', hiddenParent.id),
            item('Replies remain readable beneath a deleted parent.', 'comments', deletedParent.id),
          )
          hiddenParent.replyCount = 1
          deletedParent.replyCount = 1
          await page.route('**/*', async (route) => {
            const url = new URL(route.request().url()),
              p = url.pathname,
              method = route.request().method(),
              json = (body, status = 200) =>
                route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
            if (p === '/auth/v1/user') return json(user)
            if (p === '/api/me/account-status') return json({ status: 'active' })
            if (p === '/api/me/permissions')
              return json({ role: 'admin', capabilities: { accessAdmin: true, manageAdminRoles: false } })
            if (p === '/api/me') return json({ id: actor, email: user.email })
            if (p === '/api/users/' + actor)
              return json({
                id: actor,
                displayName: 'Fixture Player',
                biography: null,
                country: null,
                city: null,
                createdAt: time,
                updatedAt: time,
                gameExperience: [],
              })
            if (p === '/api/countries' || p === '/api/cities' || p === '/api/games') return json([])
            if (p === '/api/events/viewer-status')
              return json({
                userId: actor,
                items: route
                  .request()
                  .postDataJSON()
                  .eventIds.map((id) => ({ eventId: id, isHost: false, hasJoined: true })),
              })
            if (p === '/api/me/events')
              return json({
                items: [
                  { ...summary, title: 'Upcoming public table' },
                  {
                    ...summary,
                    id: 'e5000000-0000-4000-8000-000000000002',
                    title: 'Private ongoing table',
                    visibility: 'private',
                    startsAt: new Date(Date.now() - 60000).toISOString(),
                    endsAt: new Date(Date.now() + 3600000).toISOString(),
                  },
                  {
                    ...summary,
                    id: 'e5000000-0000-4000-8000-000000000003',
                    title: 'Finished unlisted table',
                    visibility: 'unlisted',
                    startsAt: '2020-01-01T00:00:00Z',
                    endsAt: '2020-01-01T02:00:00Z',
                  },
                  {
                    ...summary,
                    id: 'e5000000-0000-4000-8000-000000000004',
                    title: 'Cancelled private table',
                    visibility: 'private',
                    status: 'cancelled',
                  },
                ],
                pageInfo: { limit: 12, nextCursor: null },
              })
            if (p === '/api/events')
              return json({ items: [summary], pageInfo: { limit: 12, nextCursor: null } })
            if (p.startsWith(`/api/events/${eventId}/invitation`)) {
              if (method === 'POST') {
                if (p.endsWith('/rotate')) rotationCalls++
                if (p.endsWith('/revoke')) revocationCalls++
                if (holdWrite) {
                  holdWrite = false
                  await writeGate
                }
              }
              return json({
                code: p.endsWith('/revoke') ? null : '2345-6789-ABCD-EFGH',
                expiresAt: '2035-01-01T00:00:00Z',
                revokedAt: p.endsWith('/revoke') ? time : null,
              })
            }
            if (p === `/api/events/${eventId}`)
              return json({
                ...summary,
                visibility: hostMode ? 'private' : 'public',
                ...(ended ? { startsAt: '2020-01-01T18:00:00Z', endsAt: '2020-01-01T22:00:00Z' } : {}),
                description: 'A friendly tabletop session with questions, replies and post-event reviews.',
                host: { id: hostMode ? actor : host, displayName: 'Fixture Host' },
                minimumAge: 0,
                experienceLevel: 'all-levels',
                price: 0,
                currency: 'EUR',
                createdAt: time,
                updatedAt: time,
                viewer: { userId: actor, isHost: hostMode, hasJoined: !hostMode },
                address: 'Private fixture address',
              })
            const match = p.match(
              new RegExp(`^/api/events/${eventId}/(comments|reviews)(?:/([a-f0-9-]+))?(?:/(replies|hide))?$`),
            )
            if (match) {
              const [, kind, id, action] = match
              if (method === 'GET') {
                if (delayList) {
                  delayList = false
                  await new Promise((resolve) => setTimeout(resolve, 350))
                }
                if (failed)
                  return json({ code: 'DEPENDENCY_UNAVAILABLE', message: 'Unavailable', fields: {} }, 503)
                const selected = items[kind].filter(
                  (x) => kind === 'reviews' || x.parentId === (action === 'replies' ? id : null),
                )
                return json({
                  eventId,
                  viewerId: actor,
                  kind,
                  items: selected,
                  permissions: {
                    commentsOpen: !ended,
                    reviewsOpen: ended,
                    canComment: !ended,
                    canReview: ended && !items.reviews.some((x) => !x.deleted),
                    canModerateComments: true,
                    canModerateReviews: true,
                    serverTime: time,
                    endsAt: summary.endsAt,
                    cancelled: false,
                  },
                  nextCursor: null,
                })
              }
              const data = method === 'DELETE' ? {} : route.request().postDataJSON()
              if (kind === 'comments' && method === 'POST' && rejectComment) {
                rejectComment = false
                return json(
                  {
                    code: 'VALIDATION_ERROR',
                    message: 'PRIVATE_UPSTREAM_DETAIL',
                    fields: { body: ['Use valid plain text.'] },
                  },
                  400,
                )
              }
              if (holdWrite) {
                holdWrite = false
                await writeGate
              }
              let row = items[kind].find((x) => x.id === id)
              if (action === 'hide') {
                row.hidden = true
                row.body = null
                if (kind === 'reviews') row.rating = null
                row.canEdit = false
              } else if (method === 'DELETE') {
                row.deleted = true
                row.body = null
                row.canEdit = false
                row.canDelete = false
                if (kind === 'reviews') row.rating = null
              } else if (method === 'PATCH') {
                Object.assign(row, data, { editedAt: time })
              } else {
                row = item(data.body ?? null, kind, action === 'replies' ? id : null)
                if (kind === 'reviews') row.rating = data.rating
                items[kind].push(row)
                if (action === 'replies') items.comments.find((x) => x.id === id).replyCount++
              }
              return json({ eventId, viewerId: actor, id: row.id })
            }
            if (p.startsWith('/api/') || url.hostname.endsWith('.supabase.co')) return route.abort()
            return route.continue()
          })
          await page.goto(origin + `/events/${eventId}`)
          await expect(page.getByRole('tab', { name: 'Event details', exact: true })).toHaveAttribute(
            'aria-selected',
            'true',
          )
          const tabs = page.getByRole('tablist', { name: 'Event sections' })
          const back = page.getByRole('link', { name: 'Back to events', exact: true })
          const originTabs = await tabs.boundingBox(),
            originBack = await back.boundingBox()
          const checkLayout = async () => {
            const t = await tabs.boundingBox(),
              b = await back.boundingBox()
            assert.equal(t.x, originTabs.x)
            assert.equal(t.y, originTabs.y)
            assert.equal(b.x, originBack.x)
            assert.equal(b.y, originBack.y)
            assert.ok(b.y >= t.y + t.height, 'Back link stays below tabs')
            await expect(back).toHaveCount(1)
          }
          delayList = true
          await page.getByRole('tab', { name: 'Comments', exact: true }).click()
          await expect(page.getByRole('status').filter({ hasText: 'Loading comments' })).toBeVisible()
          await expect(page.getByText('What should I bring?', { exact: true })).toBeVisible()
          await expect(page.getByText('Host', { exact: true })).toBeVisible()
          await checkLayout()
          await expect(page.getByRole('heading', { name: 'Discussion game night', exact: true })).toHaveCount(
            0,
          )
          holdWrite = true
          writeGate = new Promise((resolve) => {
            releaseWrite = resolve
          })
          await page.getByRole('button', { name: 'Write a comment', exact: true }).click()
          const dialog = page.getByRole('dialog', { name: 'Write a comment', exact: true })
          await dialog.getByLabel('Comment', { exact: true }).fill('<script>window.INJECTED=true</script>')
          await dialog.getByRole('button', { name: 'Save', exact: true }).click()
          await expect(dialog.getByRole('button', { name: 'Saving…', exact: true })).toBeDisabled()
          await expect(toasts.getByText('Comment posted', { exact: true })).toHaveCount(0)
          releaseWrite()
          await expect(
            page.locator('p').getByText('<script>window.INJECTED=true</script>', { exact: true }),
          ).toBeVisible()
          await expect(toasts.getByText('Comment posted', { exact: true })).toHaveCount(1)
          const toastBounds = await toasts.boundingBox()
          assert.ok(
            Math.abs(toastBounds.x + toastBounds.width - width + 16) <= 1,
            'Toast aligns bottom-right',
          )
          assert.ok(toastBounds.y + toastBounds.height <= 985, 'Toast stays above viewport bottom')
          assert.equal(await page.evaluate(() => window.INJECTED), undefined)
          const own = page.getByRole('listitem').filter({ hasText: '<script>' })
          await own.getByRole('button', { name: 'Edit', exact: true }).click()
          await page
            .getByRole('dialog', { name: 'Edit', exact: true })
            .getByLabel('Comment', { exact: true })
            .fill('Bringing dice!')
          await page
            .getByRole('dialog', { name: 'Edit', exact: true })
            .getByRole('button', { name: 'Save', exact: true })
            .click()
          await expect(page.locator('p').getByText('Bringing dice!', { exact: true })).toBeVisible()
          await page
            .getByRole('listitem')
            .filter({ hasText: 'What should I bring?' })
            .getByRole('button', { name: 'Reply', exact: true })
            .click()
          await page
            .getByRole('form', { name: 'Write a reply', exact: true })
            .getByLabel('Reply', { exact: true })
            .fill('A character sheet.')
          await page
            .getByRole('form', { name: 'Write a reply', exact: true })
            .getByRole('button', { name: 'Post reply', exact: true })
            .click()
          await expect(page.getByRole('button', { name: 'Hide replies', exact: true })).toBeVisible()
          await expect(page.getByRole('form', { name: 'Write a reply', exact: true })).toHaveCount(0)
          await expect(toasts.getByText('Reply posted', { exact: true })).toBeVisible()
          await expect(page.locator('p').getByText('A character sheet.', { exact: true })).toBeVisible()
          for (const placeholder of [
            'This contribution was hidden by moderation.',
            'This contribution was deleted.',
          ]) {
            const thread = page
              .getByRole('listitem')
              .filter({ has: page.locator('p').getByText(placeholder, { exact: true }) })
            await expect(thread.getByRole('button', { name: 'Reply', exact: true })).toHaveCount(0)
            await thread.getByRole('button', { name: 'Show replies (1)', exact: true }).click()
          }
          await expect(
            page.locator('p').getByText('Replies remain readable beneath a hidden parent.', { exact: true }),
          ).toBeVisible()
          await expect(
            page.locator('p').getByText('Replies remain readable beneath a deleted parent.', { exact: true }),
          ).toBeVisible()
          assert.ok(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
            'Thread content wraps without horizontal overflow',
          )
          await page.screenshot({
            path: path.join(root, `.tmp/discussion-ui/comments-${width}-${theme}.png`),
            fullPage: true,
          })
          await page.getByRole('tab', { name: 'Reviews', exact: true }).click()
          await expect(
            page.getByText('Reviews become available after this event ends.', { exact: true }),
          ).toBeVisible()
          await expect(page.getByText('No reviews yet.', { exact: true })).toBeVisible()
          await checkLayout()
          // A failed foreground mutation keeps inline feedback and a readable modal toast.
          await page.getByRole('tab', { name: 'Comments', exact: true }).click()
          await dismissToasts()
          rejectComment = true
          await page.getByRole('button', { name: 'Write a comment', exact: true }).click()
          await dialog.getByLabel('Comment', { exact: true }).fill('Keep this draft after validation.')
          await dialog.getByRole('button', { name: 'Save', exact: true }).click()
          await expect(dialog.getByRole('alert')).toBeVisible()
          await expect(toasts.getByText('Action could not be completed', { exact: true })).toBeVisible()
          await expect(dialog.getByLabel('Comment', { exact: true })).toHaveValue(
            'Keep this draft after validation.',
          )
          assert.equal((await toasts.textContent()).includes('PRIVATE_UPSTREAM_DETAIL'), false)
          await toasts.getByRole('button', { name: 'Dismiss notification' }).click()
          await expect(dialog.getByRole('alert')).toBeVisible()
          await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
          ended = true
          await page.reload()
          await page.getByRole('tab', { name: 'Comments', exact: true }).click()
          await expect(
            page.getByText('Comments are closed because this event has ended.', { exact: true }),
          ).toBeVisible()
          await expect(page.getByRole('button', { name: 'Write a comment', exact: true })).toHaveCount(0)
          await page.getByRole('tab', { name: 'Reviews', exact: true }).click()
          await page.getByRole('button', { name: 'Write a review', exact: true }).click()
          await page
            .getByRole('dialog', { name: 'Write a review', exact: true })
            .getByLabel('Rating', { exact: true })
            .selectOption('4')
          await page
            .getByRole('dialog', { name: 'Write a review', exact: true })
            .getByLabel('Review (optional)', { exact: true })
            .fill('A welcoming table.')
          await page
            .getByRole('dialog', { name: 'Write a review', exact: true })
            .getByRole('button', { name: 'Save', exact: true })
            .click()
          await expect(page.getByLabel('4 out of 5 stars', { exact: true })).toBeVisible()
          await page.getByRole('button', { name: 'Edit', exact: true }).click()
          await page
            .getByRole('dialog', { name: 'Edit', exact: true })
            .getByLabel('Rating', { exact: true })
            .selectOption('3')
          await page
            .getByRole('dialog', { name: 'Edit', exact: true })
            .getByRole('button', { name: 'Save', exact: true })
            .click()
          await expect(page.getByLabel('3 out of 5 stars', { exact: true })).toBeVisible()
          await page.screenshot({
            path: path.join(root, `.tmp/discussion-ui/reviews-${width}-${theme}.png`),
            fullPage: true,
          })
          await page.getByRole('button', { name: 'Hide', exact: true }).click()
          await page
            .getByRole('dialog', { name: 'Hide', exact: true })
            .getByLabel('Moderation reason', { exact: true })
            .fill('Synthetic moderation reason')
          await page
            .getByRole('dialog', { name: 'Hide', exact: true })
            .getByRole('button', { name: 'Hide content', exact: true })
            .click()
          await expect(
            page.getByText('This contribution was hidden by moderation.', { exact: true }),
          ).toBeVisible()
          await page.getByRole('button', { name: 'Delete', exact: true }).click()
          await page
            .getByRole('dialog', { name: 'Delete', exact: true })
            .getByRole('button', { name: 'Delete', exact: true })
            .click()
          await expect(page.getByText('This contribution was deleted.', { exact: true })).toBeVisible()
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
          // Direct reload stays a full page; discovery navigation creates the shared preview.
          ended = false
          await page.goto(origin + '/events')
          await page.getByRole('link', { name: 'Discussion game night', exact: true }).click()
          const previewDialog = page.getByRole('dialog', { name: 'Event preview', exact: true })
          await expect(previewDialog).toBeVisible()
          await previewDialog.getByRole('tab', { name: 'Comments', exact: true }).click()
          await expect(previewDialog.getByText('What should I bring?', { exact: true })).toBeVisible()
          await previewDialog.getByRole('tab', { name: 'Comments', exact: true }).focus()
          await page.keyboard.press('ArrowRight')
          await expect(previewDialog.getByRole('tab', { name: 'Reviews', exact: true })).toBeFocused()
          await page.keyboard.press('Escape')
          await expect(previewDialog).toHaveCount(0)
          await expect(page.getByRole('link', { name: 'Discussion game night', exact: true })).toBeFocused()
          failed = true
          await page.goto(origin + `/events/${eventId}`)
          await page.getByRole('tab', { name: 'Comments', exact: true }).click()
          await expect(page.getByRole('alert')).toBeVisible()
          failed = false
          await page.getByRole('button', { name: 'Try again', exact: true }).click()
          await expect(page.getByText('What should I bring?', { exact: true })).toBeVisible()
          // Only the detail response becomes private; the discovery snapshot remains public.
          hostMode = true
          await page.reload()
          async function confirmation(action, preview = false) {
            await page
              .getByRole('button', {
                name: action === 'rotate' ? 'Regenerate code' : 'Revoke code',
                exact: true,
              })
              .click()
            const modal = page.getByRole('dialog', { name: 'Confirm invitation change', exact: true })
            await expect(modal).toBeVisible()
            const cancel = modal.getByRole('button', { name: 'Cancel', exact: true }),
              confirm = modal.getByRole('button', {
                name: action === 'rotate' ? 'Confirm regeneration' : 'Confirm revocation',
                exact: true,
              })
            await expect(cancel).toBeFocused()
            const bounds = await modal.boundingBox(),
              a = await confirm.boundingBox(),
              b = await cancel.boundingBox()
            assert.ok(
              Math.abs(bounds.x + bounds.width / 2 - width / 2) <= 1,
              'Invitation centered horizontally',
            )
            assert.ok(Math.abs(bounds.y + bounds.height / 2 - 500) <= 1, 'Invitation centered vertically')
            assert.ok(a.x < b.x, 'Confirm left, Cancel right')
            await cancel.click()
            assert.equal(rotationCalls, action === 'rotate' ? 0 : 1)
            assert.equal(revocationCalls, 0)
            await page
              .getByRole('button', {
                name: action === 'rotate' ? 'Regenerate code' : 'Revoke code',
                exact: true,
              })
              .click()
            holdWrite = true
            writeGate = new Promise((resolve) => {
              releaseWrite = resolve
            })
            await confirm.click()
            await expect(confirm).toBeDisabled()
            await expect(
              toasts.getByText(
                action === 'rotate' ? 'Invitation code regenerated' : 'Invitation code revoked',
                { exact: true },
              ),
            ).toHaveCount(0)
            releaseWrite()
            await expect(modal).not.toBeVisible()
            await expect(
              toasts.getByText(
                action === 'rotate' ? 'Invitation code regenerated' : 'Invitation code revoked',
                { exact: true },
              ),
            ).toHaveCount(1)
            await page.screenshot({
              path: path.join(root, `.tmp/discussion-ui/invitation-${action}-${width}-${theme}.png`),
              fullPage: !preview,
            })
          }
          await confirmation('rotate')
          await page.goto(origin + '/events')
          await expect(page.getByRole('img', { name: 'Visibility: public', exact: true })).toBeVisible()
          await expect(page.getByLabel('Event status: Upcoming', { exact: true })).toBeVisible()
          await page.getByRole('link', { name: 'Discussion game night', exact: true }).click()
          await confirmation('revoke', true)
          const previewToast = await toasts.boundingBox()
          assert.ok(
            Math.abs(previewToast.x + previewToast.width - width + 16) <= 1,
            'Preview notification remains viewport-aligned',
          )
          await expect(toasts.getByRole('button', { name: 'Dismiss notification' })).toBeVisible()
          await toasts.getByRole('button', { name: 'Dismiss notification' }).click()
          await expect(page.getByRole('dialog', { name: 'Event preview', exact: true })).toBeVisible()
          assert.equal(rotationCalls, 1)
          assert.equal(revocationCalls, 1)
          await page.goto(origin + '/my-events?period=all')
          for (const status of ['Upcoming', 'In progress', 'Finished', 'Cancelled'])
            await expect(page.getByLabel('Event status: ' + status, { exact: true })).toBeVisible()
          await expect(page.getByRole('img', { name: 'Visibility: public', exact: true })).toHaveCount(1)
          await expect(page.getByRole('img', { name: 'Visibility: private', exact: true })).toHaveCount(2)
          await expect(page.getByRole('img', { name: 'Visibility: unlisted', exact: true })).toHaveCount(1)
          await page.screenshot({
            path: path.join(root, `.tmp/discussion-ui/card-badges-${width}-${theme}.png`),
            fullPage: true,
          })
          assert.deepEqual(errors, [])
          await context.close()
          console.log(
            `PASS: ${width}px ${theme} comments/replies/edit/review/moderation and preview keyboard/focus`,
          )
        }
    } finally {
      await browser?.close()
      await new Promise((resolve) => server.httpServer.close(resolve))
    }
  },
)
