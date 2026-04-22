import { drawRadar } from './chart.js'
import { generateShareImage } from './share.js'

const LEVEL_LABEL = { L: '低', M: '中', H: '高' }
const LEVEL_CLASS = { L: 'level-low', M: 'level-mid', H: 'level-high' }

/**
 * 渲染测试结果
 */
export function renderResult(result, userLevels, dimOrder, dimDefs, config) {
  const { primary, secondary, rankings, mode } = result

  // Kicker
  const kicker = document.getElementById('result-kicker')
  if (mode === 'drunk') kicker.textContent = '隐藏人格已激活'
  else if (mode === 'burnout') kicker.textContent = '隐藏人格已激活'
  else if (mode === 'jing-fen') kicker.textContent = '隐藏人格已激活'
  else if (mode === 'unrecorded') kicker.textContent = '未收录人格触发'
  else kicker.textContent = '你的主类型'

  // 主类型
  document.getElementById('result-code').textContent = primary.code
  document.getElementById('result-name').textContent = primary.cn

  // 人格图片（兼容 image / img 字段）
  const imageWrap = document.getElementById('result-image-wrap')
  const imageEl = document.getElementById('result-image')
  const basePath = import.meta.env.BASE_URL
  const rawImageSrc = primary.image || primary.img || `images/${primary.code}.png`
  const imageSrc = rawImageSrc.startsWith('/images/')
    ? `${basePath}images/${rawImageSrc.slice('/images/'.length)}`
    : rawImageSrc.startsWith('images/')
    ? `${basePath}${rawImageSrc}`
    : rawImageSrc
  if (imageSrc) {
    imageEl.loading = 'eager'
    imageEl.removeAttribute('loading')
    imageEl.onerror = () => {
      console.warn(`图片加载失败: ${imageSrc}`)
      imageEl.src = ''
      imageWrap.style.display = 'none'
    }
    imageEl.onload = () => {
      imageWrap.style.display = ''
    }
    imageEl.alt = `${primary.cn || primary.code} 人格插画`
    imageEl.src = ''
    imageWrap.style.display = ''
    requestAnimationFrame(() => {
      imageEl.src = imageSrc
    })
  } else {
    imageEl.src = ''
    imageEl.alt = '人格插画'
    imageEl.onerror = null
    imageEl.onload = null
    imageWrap.style.display = 'none'
  }

  // 匹配度
  const totalDims = dimOrder.length
  document.getElementById('result-badge').textContent =
    `匹配度 ${primary.similarity}%` + (primary.exact != null ? ` · 精准命中 ${primary.exact}/${totalDims} 维` : '')

  // Intro & 描述
  document.getElementById('result-intro').textContent = primary.intro || ''
  document.getElementById('result-desc').textContent = primary.desc || ''

  // 次要匹配
  const secEl = document.getElementById('result-secondary')
  if (secondary && (mode === 'drunk' || mode === 'burnout' || mode === 'jing-fen' || mode === 'unrecorded')) {
    secEl.style.display = ''
    document.getElementById('secondary-info').textContent =
      `${secondary.code}（${secondary.cn}）· 匹配度 ${secondary.similarity}%`
  } else {
    secEl.style.display = 'none'
  }

  // 雷达图
  const canvas = document.getElementById('radar-chart')
  drawRadar(canvas, userLevels, dimOrder, dimDefs)

  // 维度详情
  const detailEl = document.getElementById('dimensions-detail')
  detailEl.innerHTML = ''
  for (const dim of dimOrder) {
    const level = userLevels[dim] || 'M'
    const def = dimDefs[dim]
    if (!def) continue

    const row = document.createElement('div')
    row.className = 'dim-row'
    row.innerHTML = `
      <div class="dim-header">
        <span class="dim-name">${def.name}</span>
        <span class="dim-level ${LEVEL_CLASS[level]}">${LEVEL_LABEL[level]}</span>
      </div>
      <div class="dim-desc">${def.levels[level]}</div>
    `
    detailEl.appendChild(row)
  }

  // TOP 5
  const topEl = document.getElementById('top-list')
  topEl.innerHTML = ''
  const top5 = rankings.slice(0, 5)
  top5.forEach((t, i) => {
    const item = document.createElement('div')
    item.className = 'top-item'
    item.innerHTML = `
      <span class="top-rank">#${i + 1}</span>
      <span class="top-code">${t.code}</span>
      <span class="top-name">${t.cn}</span>
      <span class="top-sim">${t.similarity}%</span>
    `
    topEl.appendChild(item)
  })

  // 免责声明
  document.getElementById('disclaimer').textContent =
    mode === 'normal' ? config.display.funNote : config.display.funNoteSpecial

  // 下载分享图
  const btnDownload = document.getElementById('btn-download')
  btnDownload.onclick = () => {
    generateShareImage(primary, userLevels, dimOrder, dimDefs, mode)
  }
}
