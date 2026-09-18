---
layout: archive
title: "Books"
permalink: /books/
author_profile: true
---

<style>
.archive > .page__title { font-size: clamp(36px, 4vw, 48px); font-weight: 700; letter-spacing: -.045em; margin-bottom: 12px; color: var(--global-text-color); }
.reading-library { --shelf-card: #f5f5f7; --shelf-ink: #1d1d1f; --shelf-muted: #626269; --shelf-line: rgba(0,0,0,.065); --shelf-blue: #0066cc; --shelf-button: #fff; color: var(--shelf-ink); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; padding-bottom: 36px; }
.reading-library *, .reading-library *::before, .reading-library *::after { box-sizing: border-box; }
.reading-library .shelf-intro { margin: 0 0 44px; color: var(--shelf-muted); font-size: 17px; line-height: 1.8; letter-spacing: .015em; }
.reading-library .shelf-section + .shelf-section { margin-top: 38px; }
.reading-library .shelf-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
.reading-library .shelf-heading h2 { margin: 0; padding: 0; border: 0; font-size: 23px; line-height: 1.4; font-weight: 650; letter-spacing: -.025em; }
.reading-library .shelf-heading p { margin: 4px 0 0; font-size: 11px; line-height: 1.5; letter-spacing: .12em; color: var(--shelf-muted); }
.reading-library .shelf-count { flex: none; color: var(--shelf-muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.reading-library .shelf-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.reading-library .book-card { display: flex; flex-direction: column; min-width: 0; padding: 26px; margin: 0; border: 1px solid var(--shelf-line); border-radius: 20px; background: var(--shelf-card); transition: transform .2s ease, box-shadow .2s ease; }
.reading-library .book-topic { margin: 0 0 15px; color: var(--shelf-muted); font-size: 11px; font-weight: 600; letter-spacing: .09em; line-height: 1.5; }
.reading-library .book-card h3 { margin: 0; padding: 0; border: 0; font-size: 21px; font-weight: 650; letter-spacing: -.025em; line-height: 1.4; overflow-wrap: anywhere; color: var(--shelf-ink); }
.reading-library .book-author { margin: 8px 0 0; color: var(--shelf-muted); font-size: 13px; line-height: 1.6; }
.reading-library .book-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: 27px; margin-top: auto; }
.reading-library .book-note { font-size: 12px; color: var(--shelf-muted); line-height: 1.6; }
.reading-library a.pdf-button, .reading-library a.pdf-button:visited { display: inline-flex; align-items: center; justify-content: center; gap: 6px; flex: none; min-height: 44px; padding: 9px 14px; border-radius: 999px; background: var(--shelf-button); border: 1px solid var(--shelf-line); color: var(--shelf-blue); text-decoration: none; font-size: 12px; font-weight: 600; line-height: 1.4; transition: background .2s ease, color .2s ease; }
.reading-library .pdf-button svg { width: 14px; height: 14px; flex: none; }
.reading-library a.pdf-button:hover { color: #fff; background: #0066cc; text-decoration: none; }
.reading-library a.pdf-button:focus-visible { outline: 3px solid var(--shelf-blue); outline-offset: 4px; }
html[data-theme="dark"] .reading-library { --shelf-card: #303033; --shelf-ink: #f5f5f7; --shelf-muted: #b9b9c0; --shelf-line: rgba(255,255,255,.1); --shelf-blue: #8ac4ff; --shelf-button: #414145; }
@media (hover: hover) { .reading-library .book-card:hover { transform: translateY(-3px); box-shadow: 0 10px 28px rgba(0,0,0,.045); } }
@media (max-width: 1100px) and (min-width: 926px), (max-width: 600px) { .reading-library .shelf-grid { grid-template-columns: 1fr; } }
@media (max-width: 600px) { .reading-library .shelf-intro { margin-bottom: 32px; font-size: 15px; } .reading-library .book-card { padding: 22px; } .reading-library .book-card h3 { font-size: 20px; } .reading-library .shelf-heading h2 { font-size: 21px; } }
@media (prefers-reduced-motion: reduce) { .reading-library .book-card, .reading-library a.pdf-button { transition: none; } .reading-library .book-card:hover { transform: none; } }
</style>

<div class="reading-library">
  <p class="shelf-intro">阅读、思考，留下笔记。<br>这里收藏我的书籍与学习记录。</p>
  <section class="shelf-section" aria-labelledby="currently-reading">
    <header class="shelf-heading">
      <div><h2 id="currently-reading">正在阅读</h2><p>CURRENTLY READING</p></div>
      <span class="shelf-count">02 本</span>
    </header>
    <div class="shelf-grid">
      <article class="book-card">
        <p class="book-topic">强化学习</p>
        <h3>Reinforcement Learning:<br>An Introduction</h3>
        <p class="book-author">Richard S. Sutton</p>
        <div class="book-footer"><span class="book-note">前五章笔记</span><a class="pdf-button" href="{{ '/files/前五章.pdf' | relative_url }}" aria-label="阅读强化学习前五章笔记 PDF">阅读 PDF <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></a></div>
      </article>
      <article class="book-card">
        <p class="book-topic">随机控制</p>
        <h3>随机控制理论</h3>
        <div class="book-footer"><span class="book-note">讨论班笔记 · 5.30</span><a class="pdf-button" href="{{ '/files/随机控制讨论班笔记5.30.pdf' | relative_url }}" aria-label="阅读随机控制讨论班笔记 5.30 PDF">阅读 PDF <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></a></div>
      </article>
    </div>
  </section>
  <section class="shelf-section" aria-labelledby="finished-reading">
    <header class="shelf-heading">
      <div><h2 id="finished-reading">已读完</h2><p>COMPLETED</p></div>
      <span class="shelf-count">02 本</span>
    </header>
    <div class="shelf-grid">
      <article class="book-card">
        <p class="book-topic">随机分析</p>
        <h3>随机分析</h3>
        <div class="book-footer"><span class="book-note">学习笔记</span><a class="pdf-button" href="{{ '/files/随机分析笔记.pdf' | relative_url }}" aria-label="阅读随机分析笔记 PDF">阅读 PDF <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></a></div>
      </article>
      <article class="book-card">
        <p class="book-topic">最优化</p>
        <h3>Convex Optimization Theory</h3>
        <p class="book-author">Dimitri P. Bertsekas</p>
        <div class="book-footer"><span class="book-note">完整学习笔记</span><a class="pdf-button" href="{{ '/files/最优化笔记.pdf' | relative_url }}" aria-label="阅读最优化笔记全文 PDF">阅读 PDF <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></a></div>
      </article>
    </div>
  </section>
</div>
