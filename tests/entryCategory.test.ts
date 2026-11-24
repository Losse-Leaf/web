import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  ENTRY_CATEGORY_OPTIONS,
  entryMatchesCategory,
  getEntryCategory,
  getEntryDisplayCategoryLabel,
  hasDistinctEntryTitle,
  normalizeEntryCategory,
  type LifeEntry,
} from '../src/types/index.ts'
import {
  getEntryBadgeClass,
  getEntryTimelineNodeClass,
} from '../src/utils/entryCategoryStyle.ts'

const makeEntry = (overrides: Partial<LifeEntry>): LifeEntry => ({
  id: 1,
  type: 'life',
  title: '独立标题',
  content: '这是一段普通正文内容。',
  ...overrides,
})

describe('ENTRY_CATEGORY_OPTIONS and normalizeEntryCategory', () => {
  it('defines all five native categories aligned with Vesper Space', () => {
    assert.deepEqual(
      ENTRY_CATEGORY_OPTIONS.map((o) => [o.code, o.label]),
      [
        ['', '日常'],
        ['Photography', '摄影'],
        ['Travel', '旅途'],
        ['Still Life', '静物'],
        ['Motion', '影像'],
      ],
    )
    for (const opt of ENTRY_CATEGORY_OPTIONS) {
      assert.ok(opt.accent.startsWith('var(--tag-'))
    }
  })

  it('normalizes canonical codes, aliases, and unknown fallbacks', () => {
    assert.equal(normalizeEntryCategory(undefined), '')
    assert.equal(normalizeEntryCategory(''), '')
    assert.equal(normalizeEntryCategory('  daily  '), '')
    assert.equal(normalizeEntryCategory('日常随笔'), '')
    assert.equal(normalizeEntryCategory('Photography'), 'Photography')
    assert.equal(normalizeEntryCategory(' photography '), 'Photography')
    assert.equal(normalizeEntryCategory('摄影'), 'Photography')
    assert.equal(normalizeEntryCategory('Travel'), 'Travel')
    assert.equal(normalizeEntryCategory('旅途'), 'Travel')
    assert.equal(normalizeEntryCategory('旅行'), 'Travel')
    assert.equal(normalizeEntryCategory('Still Life'), 'Still Life')
    assert.equal(normalizeEntryCategory('still_life'), 'Still Life')
    assert.equal(normalizeEntryCategory('still-life'), 'Still Life')
    assert.equal(normalizeEntryCategory('静物'), 'Still Life')
    assert.equal(normalizeEntryCategory('Motion'), 'Motion')
    assert.equal(normalizeEntryCategory('video'), 'Motion')
    assert.equal(normalizeEntryCategory('影像'), 'Motion')
    assert.equal(normalizeEntryCategory('餐饮'), '')
    assert.equal(normalizeEntryCategory('Unknown'), '')
  })
})

describe('category display labels and strict transaction isolation', () => {
  it('returns proper display labels for life, gallery, wish, and transaction entries', () => {
    assert.equal(getEntryDisplayCategoryLabel(makeEntry({ category: '' })), '日常')
    assert.equal(getEntryDisplayCategoryLabel(makeEntry({ category: 'Photography' })), '摄影')
    assert.equal(getEntryDisplayCategoryLabel(makeEntry({ category: 'Travel' })), '旅途')
    assert.equal(getEntryDisplayCategoryLabel(makeEntry({ category: 'Still Life' })), '静物')
    assert.equal(getEntryDisplayCategoryLabel(makeEntry({ category: 'Motion' })), '影像')
    assert.equal(getEntryDisplayCategoryLabel(makeEntry({ type: 'wish', category: 'Still Life' })), '心愿')
    assert.equal(getEntryDisplayCategoryLabel(makeEntry({ type: 'life', wish_id: 7 })), '心愿')
    assert.equal(
      getEntryDisplayCategoryLabel(
        makeEntry({
          type: 'transaction',
          is_transaction: true,
          category: '餐饮',
        }),
      ),
      '账目',
    )
    assert.equal(
      getEntryDisplayCategoryLabel(
        makeEntry({
          type: 'transaction',
          is_transaction: true,
          category: 'Photography',
        }),
      ),
      '账目',
    )
  })

  it('strictly isolates transactions from gallery and daily filters', () => {
    const txWithGalleryName = makeEntry({
      id: -10,
      type: 'transaction',
      is_transaction: true,
      category: 'Travel',
      wish_id: 3,
    })
    const txFlagOnly = makeEntry({
      id: -11,
      type: 'life',
      is_transaction: true,
      category: 'Photography',
    })

    for (const tx of [txWithGalleryName, txFlagOnly]) {
      assert.equal(getEntryCategory(tx), 'transaction')
      assert.equal(entryMatchesCategory(tx, 'all'), true)
      assert.equal(entryMatchesCategory(tx, 'transaction'), true)
      assert.equal(entryMatchesCategory(tx, 'daily'), false)
      assert.equal(entryMatchesCategory(tx, 'wish'), false)
      assert.equal(entryMatchesCategory(tx, 'Photography'), false)
      assert.equal(entryMatchesCategory(tx, 'Travel'), false)
      assert.equal(entryMatchesCategory(tx, 'Still Life'), false)
      assert.equal(entryMatchesCategory(tx, 'Motion'), false)
      assert.match(getEntryBadgeClass(tx), /emerald/)
      assert.match(getEntryTimelineNodeClass(tx), /emerald/)
    }
  })

  it('matches gallery filters specifically while keeping all life entries inside daily', () => {
    const plainLife = makeEntry({ id: 1, type: 'life', category: '' })
    const photoLife = makeEntry({ id: 2, type: 'life', category: 'Photography' })
    const travelLife = makeEntry({ id: 3, type: 'life', category: 'Travel' })
    const stillLife = makeEntry({ id: 4, type: 'life', category: 'Still Life' })
    const motionLife = makeEntry({ id: 5, type: 'life', category: 'Motion' })
    const wishEntry = makeEntry({ id: 6, type: 'wish', category: 'Still Life' })

    for (const item of [plainLife, photoLife, travelLife, stillLife, motionLife]) {
      assert.equal(entryMatchesCategory(item, 'all'), true)
      assert.equal(entryMatchesCategory(item, 'daily'), true)
      assert.equal(entryMatchesCategory(item, 'wish'), false)
      assert.equal(entryMatchesCategory(item, 'transaction'), false)
    }

    assert.equal(entryMatchesCategory(plainLife, 'Photography'), false)
    assert.equal(entryMatchesCategory(photoLife, 'Photography'), true)
    assert.equal(entryMatchesCategory(photoLife, 'Travel'), false)
    assert.equal(entryMatchesCategory(travelLife, 'Travel'), true)
    assert.equal(entryMatchesCategory(stillLife, 'Still Life'), true)
    assert.equal(entryMatchesCategory(motionLife, 'Motion'), true)

    assert.equal(entryMatchesCategory(wishEntry, 'wish'), true)
    assert.equal(entryMatchesCategory(wishEntry, 'daily'), false)
    assert.equal(entryMatchesCategory(wishEntry, 'Still Life'), false)

    assert.match(getEntryBadgeClass(photoLife), /--tag-photography/)
    assert.match(getEntryBadgeClass(travelLife), /--tag-travel/)
    assert.match(getEntryBadgeClass(stillLife), /--tag-still-life/)
    assert.match(getEntryBadgeClass(motionLife), /--tag-motion/)
    assert.match(getEntryTimelineNodeClass(motionLife), /--tag-motion/)
  })
})

describe('hasDistinctEntryTitle', () => {
  it('returns false for empty, placeholder, and content-derived titles', () => {
    assert.equal(hasDistinctEntryTitle(makeEntry({ title: '', content: '雨后初晴' })), false)
    assert.equal(hasDistinctEntryTitle(makeEntry({ title: '   ', content: '雨后初晴' })), false)
    assert.equal(hasDistinctEntryTitle(makeEntry({ title: '无题随笔', content: '雨后初晴' })), false)
    assert.equal(hasDistinctEntryTitle(makeEntry({ title: '无题', content: '雨后初晴' })), false)
    assert.equal(
      hasDistinctEntryTitle(makeEntry({ title: '现场快门 · 2026.11.24', content: '定格的瞬间。' })),
      false,
    )
    assert.equal(
      hasDistinctEntryTitle(makeEntry({ title: '现场记录 · 杭州', content: '沿湖步行五公里。' })),
      false,
    )
    assert.equal(
      hasDistinctEntryTitle(makeEntry({ title: '今晚风很轻', content: '今晚风很轻' })),
      false,
    )
    assert.equal(
      hasDistinctEntryTitle(
        makeEntry({
          title: '今晚风很轻，路灯落满梧桐叶…',
          content: '今晚风很轻，路灯落满梧桐叶，一路走回家很安静。',
        }),
      ),
      false,
    )
    assert.equal(
      hasDistinctEntryTitle(
        makeEntry({
          title: '今晚风很轻...',
          content: '今晚风很轻，走过苏堤时听见水声。',
        }),
      ),
      false,
    )
    assert.equal(hasDistinctEntryTitle(makeEntry({ title: '……', content: '一段正文' })), false)
  })

  it('returns true for genuinely distinct titles', () => {
    assert.equal(
      hasDistinctEntryTitle(makeEntry({ title: '西湖夜跑', content: '今晚绕着白堤跑了五公里。' })),
      true,
    )
    assert.equal(
      hasDistinctEntryTitle(makeEntry({ title: '胶片试拍', content: '' })),
      true,
    )
  })
})

describe('entry API category payload passthrough', () => {
  it('passes category in createLifeEntry and preserves explicit empty string in updateLifeEntry', async () => {
    const calls: Array<{ url: string; method?: string; body?: string }> = []
    const originalFetch = globalThis.fetch

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({
        url: String(input),
        method: init?.method,
        body: typeof init?.body === 'string' ? init.body : undefined,
      })
      return new Response(
        JSON.stringify({
          code: 0,
          data: {
            id: 42,
            type: 'life',
            category: 'Photography',
            title: '试拍',
            content: '测试正文',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }) as typeof fetch

    try {
      const api = await import('../src/utils/api.ts')

      await api.createLifeEntry({
        type: 'life',
        category: 'Photography',
        title: '',
        content: '午后的自然光落在窗台。',
      })

      assert.equal(calls.length, 1)
      assert.equal(calls[0].method, 'POST')
      const createdBody = JSON.parse(calls[0].body || '{}')
      assert.equal(createdBody.category, 'Photography')
      assert.equal(createdBody.title, '午后的自然光落在窗台。')

      await api.updateLifeEntry(42, {
        type: 'life',
        category: '',
        title: '改回日常',
        content: '测试更新正文',
      })

      assert.equal(calls.length, 2)
      assert.equal(calls[1].method, 'PUT')
      const updatedBody = JSON.parse(calls[1].body || '{}')
      assert.equal(Object.prototype.hasOwnProperty.call(updatedBody, 'category'), true)
      assert.equal(updatedBody.category, '')

      await api.updateLifeEntry(42, {
        title: '仅改标题',
      })

      assert.equal(calls.length, 3)
      const partialBody = JSON.parse(calls[2].body || '{}')
      assert.equal(Object.prototype.hasOwnProperty.call(partialBody, 'category'), false)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

