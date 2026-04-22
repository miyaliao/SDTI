/**
 * SBTI 评分引擎 — 纯函数，无 DOM 依赖
 */

/**
 * 按维度求和：每维度 2 题，分值相加 (范围 2-6)
 * @param {Object} answers  { q1: 2, q3: 1, ... }
 * @param {Array}  questions 题目定义数组
 * @returns {Object} { S1: 5, S2: 3, ... }
 */
export function calcDimensionScores(answers, questions) {
  const scores = {}
  for (const q of questions) {
    if (answers[q.id] == null) continue
    scores[q.dim] = (scores[q.dim] || 0) + answers[q.id]
  }
  return scores
}

/**
 * 原始分 → L/M/H 等级
 * @param {Object} scores      { S1: 5, ... }
 * @param {Object} thresholds  { L: [2,3], M: [4,4], H: [5,6] }
 * @returns {Object} { S1: 'H', S2: 'L', ... }
 */
export function scoresToLevels(scores, thresholds) {
  const levels = {}
  for (const [dim, score] of Object.entries(scores)) {
    if (score <= thresholds.L[1]) levels[dim] = 'L'
    else if (score >= thresholds.H[0]) levels[dim] = 'H'
    else levels[dim] = 'M'
  }
  return levels
}

/**
 * 等级 → 数值 (L=1, M=2, H=3)
 */
const LEVEL_NUM = { L: 1, M: 2, H: 3 }

function isLevelAtLeast(level, minLevel) {
  return (LEVEL_NUM[level] || 0) >= (LEVEL_NUM[minLevel] || 0)
}

function isLevelDistributionTooEven(userLevels, dimOrder) {
  const counts = { L: 0, M: 0, H: 0 }
  for (const dim of dimOrder) {
    const lv = userLevels[dim] || 'M'
    counts[lv] = (counts[lv] || 0) + 1
  }

  const values = Object.values(counts)
  const max = Math.max(...values)
  const min = Math.min(...values)

  // 例如 13 维下的 5/4/4 也视为“过于平均”。
  return max - min <= 1
}

/**
 * 解析人格类型的 pattern 字符串
 * "HHH-HMH-MHH-HHH-MHM" → ['H','H','H','H','M','H','M','H','H','H','H','H','M','H','M']
 */
export function parsePattern(pattern) {
  return pattern.replace(/-/g, '').split('')
}

/**
 * 计算用户向量与类型 pattern 的曼哈顿距离
 * @param {Object} userLevels  { S1: 'H', S2: 'L', ... }
 * @param {Array}  dimOrder    ['S1','S2','S3','E1',...]
 * @param {string} pattern     "HHH-HMH-MHH-HHH-MHM"
 * @param {Object} options     { maxDistance?: number }
 * @returns {{ distance: number, exact: number, similarity: number }}
 */
export function matchType(userLevels, dimOrder, pattern, options = {}) {
  const typeLevels = parsePattern(pattern)
  const maxDistance = options.maxDistance ?? dimOrder.length * 2
  let distance = 0
  let exact = 0

  for (let i = 0; i < dimOrder.length; i++) {
    const userVal = LEVEL_NUM[userLevels[dimOrder[i]]] || 2
    const typeVal = LEVEL_NUM[typeLevels[i]] || 2
    const diff = Math.abs(userVal - typeVal)
    distance += diff
    if (diff === 0) exact++
  }

  const similarity = Math.max(0, Math.round((1 - distance / maxDistance) * 100))
  return { distance, exact, similarity }
}

/**
 * 匹配所有类型，排序，应用特殊覆盖
 * @param {Object}  userLevels   { S1: 'H', ... }
 * @param {Array}   dimOrder     维度顺序
 * @param {Array}   standardTypes 标准类型数组
 * @param {Array}   specialTypes  特殊类型数组
 * @param {Object}  options      { isDrunk: boolean, maxDistance?: number, fallbackThreshold?: number }
 * @returns {{ primary: Object, secondary: Object|null, rankings: Array, mode: string }}
 */
export function determineResult(userLevels, dimOrder, standardTypes, specialTypes, options = {}) {
  const maxDistance = options.maxDistance ?? dimOrder.length * 2
  const fallbackThreshold = options.fallbackThreshold ?? 60
  const rankings = standardTypes.map((type) => ({
    ...type,
    ...matchType(userLevels, dimOrder, type.pattern, { maxDistance }),
  }))

  // 排序：距离升序 → 精准命中降序 → 相似度降序
  rankings.sort((a, b) => a.distance - b.distance || b.exact - a.exact || b.similarity - a.similarity)

  const best = rankings[0]
  const second = rankings[1] || null
  const drunk = specialTypes.find((t) => t.code === 'DRUNK')
  const unrecorded = specialTypes.find((t) => t.code === '404')
  const burnout = specialTypes.find((t) => t.code === 'BURNOUT')

  // 酒鬼覆盖
  if (options.isDrunk && drunk) {
    return {
      primary: { ...drunk, similarity: best.similarity, exact: best.exact },
      secondary: best,
      rankings,
      mode: 'drunk',
    }
  }

  // 灰烬人：Ac3 = H 且 Ac4 = L 且 (Ac1 >= M 或 F3 >= M)
  const isBurnout =
    userLevels.Ac3 === 'H' &&
    userLevels.Ac4 === 'L' &&
    (isLevelAtLeast(userLevels.Ac1, 'M') || isLevelAtLeast(userLevels.F3, 'M'))

  if (isBurnout && burnout) {
    return {
      primary: { ...burnout, similarity: best.similarity, exact: best.exact },
      secondary: best,
      rankings,
      mode: 'burnout',
    }
  }

  // 404：命中任一条件即触发
  const isLowSimilarity = best.similarity < fallbackThreshold
  const topGap = second ? best.similarity - second.similarity : Infinity
  const isTopGapTooClose = topGap < 3
  const isEvenMix = isLevelDistributionTooEven(userLevels, dimOrder)

  if ((isLowSimilarity || isTopGapTooClose || isEvenMix) && unrecorded) {
    return {
      primary: { ...unrecorded, similarity: best.similarity, exact: best.exact },
      secondary: best,
      rankings,
      mode: 'unrecorded',
    }
  }

  return {
    primary: best,
    secondary: second,
    rankings,
    mode: 'normal',
  }
}
