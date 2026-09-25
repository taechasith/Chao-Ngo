/* Project-owned content and navigation; the original ThreeUI scene is unchanged. */
(() => {
  const entry = document.createElement("section");
  entry.className = "chao-scene-entry";
  entry.setAttribute("aria-label", "เริ่มต้นกับเจ้าเงาะ");
  entry.innerHTML = '<a class="chao-enter" href="/play" target="_top">เริ่มการสืบสวน <span aria-hidden="true">↗</span></a><span class="chao-entry-note">เข้าสู่ระบบก่อนเปิดแฟ้ม · เล่นต่อจากจุดเดิมได้</span>';
  document.body.append(entry);
  const mindCards = [
    { theme: "quantum", number: "01 / NODE ZONE", copy: "เมื่อการสังเกตเปลี่ยน คำตอบอาจเปลี่ยนตาม" },
    { theme: "space", number: "02 / NODE ZONE", copy: "แกะรอยหลักฐานจากห้วงอวกาศ" },
    { theme: "bio", number: "03 / NETLOOD CITY", copy: "เชื่อมหลักฐานชีวภาพกับเรื่องของผู้คน" },
    { theme: "fintech", number: "04 / NETLOOD CITY", copy: "อ่านเบาะแสจากข้อมูลการเงิน" },
  ];
  document.querySelectorAll(".logos .mind-card").forEach((card, index) => {
    const details = mindCards[index];
    const cell = card.querySelector(".cell");
    if (!details || !cell) return;
    card.dataset.theme = details.theme;
    card.setAttribute("aria-label", `เปิดคดี ${cell.querySelector(".mind-title")?.textContent?.trim() || details.theme}: ${details.copy}`);
    cell.insertAdjacentHTML("beforeend", `<span class="mind-no">${details.number}</span><span class="mind-art" aria-hidden="true"></span><p class="mind-copy">${details.copy}</p><span class="mind-action">เปิดคดี <span aria-hidden="true">↗</span></span>`);
  });
  const terminal = document.getElementById("termstatus");
  if (terminal) {
    const status = document.createElement("span");
    status.className = "chao-terminal-status";
    status.textContent = "พร้อมเริ่มการสืบสวน";
    terminal.querySelector(".txt").setAttribute("aria-hidden", "true");
    terminal.append(status);
    terminal.title = "เปลี่ยนมุมมองของหน้าเว็บ";
  }
  const sync = () => { entry.classList.toggle("is-away", window.scrollY > window.innerHeight * .45 || document.body.classList.contains("menu-open")); };
  window.addEventListener("scroll", sync, { passive: true });
  new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  document.querySelectorAll('a[href="/onboarding"]').forEach(link => {
    if (/เปิดแฟ้ม|เริ่มเล่น|เริ่มเปิด/.test(link.textContent || "")) link.setAttribute("href", "/play");
  });
  document.querySelectorAll('a[href^="/"]').forEach(link => link.setAttribute("target", "_top"));
  // Fragment links in srcdoc otherwise resolve against the parent URL and reload the iframe.
  document.addEventListener("click", (event) => {
    const link = event.target instanceof Element ? event.target.closest('a[href^="#"]') : null;
    const fragment = link?.getAttribute("href")?.slice(1);
    const destination = fragment ? document.getElementById(fragment) : null;
    if (!destination) return;
    event.preventDefault();
    requestAnimationFrame(() => {
      destination.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      if (link.classList.contains("chao-skip")) destination.focus({ preventScroll: true });
    });
  });
  const skip = document.createElement("a");
  skip.href = "#top"; skip.className = "chao-skip"; skip.textContent = "ข้ามฉากไปยังเนื้อหา";
  document.body.prepend(skip);
  const content = document.getElementById("top");
  if (content) content.tabIndex = -1;
})();
