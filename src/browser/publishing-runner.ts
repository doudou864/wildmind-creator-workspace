import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { z } from 'zod';
import { runEgo } from './ego.ts';

const platformSchema = z.object({
  categories: z.array(z.string()).default([]),
  id: z.string(),
  name: z.string(),
  home: z.url(),
  accountId: z.string(),
  accountNames: z.array(z.string()),
  uploadUrl: z.url().nullable(),
  videoInput: z.string().nullable(),
  titleInput: z.string(),
  descriptionInput: z.string().nullable(),
  titleMax: z.number(),
  descriptionMax: z.number(),
  uploadedText: z.string(),
  coverRatios: z.array(z.string()),
});
export type UploadPlatform = z.infer<typeof platformSchema>;
export async function publishingBrowserConfig() {
  return z
    .object({
      pollMs: z.number().positive(),
      uploadTimeoutMs: z.number().positive(),
      platforms: z.array(platformSchema),
    })
    .parse(parse(await readFile('config/publishing-browser.yaml', 'utf8')));
}
export type UploadPage = { spaceId: number; label: string };
export async function publishingPageCall(page: UploadPage, script: string) {
  return runEgo(`const t=await taskSpace(${page.spaceId});const p=t.page(${JSON.stringify(page.label)});${script}`);
}
export async function publishingObservation(page: UploadPage) {
  return (await publishingPageCall(
    page,
    `console.log('WORKSPACE_RESULT:'+JSON.stringify({url:await p.url(),snapshot:await p.snapshot({scope:'full_page'}),controls:await p.evaluate(()=>[...document.querySelectorAll('input[type=checkbox],input[type=radio],[role=radio],[role=switch]')].map(e=>({label:(e.getAttribute('aria-label')||e.parentElement.parentElement.innerText||'').slice(0,160),name:e.getAttribute('name'),checked:e.checked??e.getAttribute('aria-checked')})))}));`,
  )) as { url: string; snapshot: string };
}
export async function createPublishingSpace(name: string) {
  return (await runEgo(
    `const t=await taskSpace(${JSON.stringify(name)});console.log('WORKSPACE_RESULT:'+JSON.stringify({spaceId:t.spaceId,name:t.name}));`,
  )) as { spaceId: number; name: string };
}
export async function newPublishingPage(spaceId: number) {
  return (await runEgo(
    `const t=await taskSpace(${spaceId});const p=await t.newPage();console.log('WORKSPACE_RESULT:'+JSON.stringify(p.label));`,
  )) as string;
}
// Operations are chosen by the worker's fixed stages. Model output is never executed as browser code.
export async function navigatePublishing(page: UploadPage, url: string) {
  await publishingPageCall(page, `await p.goto(${JSON.stringify(url)});console.log('WORKSPACE_RESULT:true');`);
}
export async function beginVideoUpload(page: UploadPage, cfg: UploadPlatform, file: string) {
  const code = cfg.videoInput
    ? `await p.setInputFiles(${JSON.stringify(cfg.videoInput)},[${JSON.stringify(file)}]);`
    : `await p.click('loc=role:button[name="上传视频"]');await p.waitForSelector('text="选择文件"',{timeout:15000});const chooser=p.waitForFileChooser({timeout:15000});await p.click('text="选择文件"');await (await chooser).setFiles(${JSON.stringify(file)});`;
  await publishingPageCall(page, code + `console.log('WORKSPACE_RESULT:true');`);
}
export async function fillPublishingCopy(
  page: UploadPage,
  cfg: UploadPlatform,
  copy: { title: string; description: string; tags: string[] },
) {
  let code = `await p.fill(${JSON.stringify(cfg.titleInput)},${JSON.stringify(copy.title)});`;
  if (cfg.descriptionInput)
    code += `await p.fill(${JSON.stringify(cfg.descriptionInput)},${JSON.stringify(copy.description)});`;
  // Tags use native field entry. YouTube hashtags are part of the saved description.
  if (cfg.id === 'bilibili') {
    code += `const count=await p.evaluate(()=>document.querySelectorAll('.label-item-v2-container svg.close').length);for(let i=0;i<count;i++)await p.click('.label-item-v2-container svg.close >> nth=0');`;
    code += `const s=await p.snapshot({scope:'full_page'});const line=s.split('\\n').find(l=>l.includes('textbox')&&l.includes('[ref=')&&!l.includes('loc='));if(!line)throw Error('标签输入框未识别');const ref='@'+line.match(/ref=([0-9]+)/)[1];`;
    for (const tag of copy.tags) code += `await p.fill(ref,${JSON.stringify(tag)});await p.press(ref,'Enter');`;
  } else if (cfg.id !== 'youtube' && cfg.descriptionInput) {
    code += `await p.focus(${JSON.stringify(cfg.descriptionInput)});await p.keyboard.press('ControlOrMeta+End');`;
    for (const tag of copy.tags)
      code += `await p.keyboard.type(${JSON.stringify('\n#' + tag)});await p.waitForTimeout(1200);await p.keyboard.press('Enter');`;
  }
  await publishingPageCall(page, code + `console.log('WORKSPACE_RESULT:true');`);
}
export async function fillPublishingCovers(page: UploadPage, cfg: UploadPlatform, covers: Record<string, string>) {
  const file = (ratio: string) => JSON.stringify(covers[ratio]);
  const scripts: Record<string, string> = {
    douyin: `await p.click('text="选择封面" >> nth=0');await p.setInputFiles('.upload-BvM5FF input.semi-upload-hidden-input',[${file('4:3')}]);await p.click('text="设置竖封面"');await p.setInputFiles('.upload-BvM5FF input.semi-upload-hidden-input',[${file('3:4')}]);await p.click('text="完成"');`,
    xiaohongshu: `await p.hover('.default.row');await p.click('text="编辑封面"');await p.waitForSelector('text="裁剪"',{timeout:30000});await p.setInputFiles('input[aria-label="上传封面图片"]',[${file('3:4')}]);await p.click('text="裁剪"');await p.click('text="3:4"');await p.click('text="完成"');await p.waitForSelector('text="裁剪"',{state:'hidden',timeout:40000});`,
    bilibili: `await p.click('text="添加封面"');await p.setInputFiles('input[accept="image/png, image/jpeg"]',[${file('4:3')}]);await p.click('text="个人空间封面（16:9）"');await p.setInputFiles('input[accept="image/png, image/jpeg"]',[${file('16:9')}]);await p.click('text="完成"');`,
    youtube: `const chooser=p.waitForFileChooser({timeout:15000});await p.click('loc=role:button[name="上传文件"]');await (await chooser).setFiles(${file('16:9')});`,
  };
  if (!scripts[cfg.id]) throw Error('平台封面操作未核验');
  await publishingPageCall(page, scripts[cfg.id] + `console.log('WORKSPACE_RESULT:true');`);
}
export async function screenshotPublishing(page: UploadPage, file: string) {
  await publishingPageCall(
    page,
    `console.log('WORKSPACE_RESULT:'+JSON.stringify(await p.screenshot({path:${JSON.stringify(file)},fullPage:true})));`,
  );
}

export async function fillPublishingSettings(
  page: UploadPage,
  cfg: UploadPlatform,
  aiGenerated: boolean | null,
  category: string | null,
) {
  const yes = aiGenerated === true;
  const scripts: Record<string, string> = {
    douyin: yes
      ? `const s=await p.snapshot({scope:'full_page'});if(!s.includes('text "内容由AI生成"')){await p.click('text="请选择自主声明"');await p.click('text="内容由AI生成"');await p.click('text="确定"');}`
      : '',
    xiaohongshu:
      `const checked=await p.evaluate(()=>[...document.querySelectorAll('input[type=checkbox]')].map(e=>e.checked));if(checked.length!==3)throw Error('原创声明控件发生变化');if(!checked[1]){await p.click('.d-switch-simulator >> nth=1');await p.waitForSelector('text="声明原创"');const agreed=await p.evaluate(()=>document.querySelector('.d-checkbox input[type=checkbox]')?.checked);if(!agreed)await p.click('.d-checkbox-simulator');await p.click('text="声明原创"');await p.waitForSelector('text="声明原创"',{state:'hidden',timeout:15000});}` +
      (yes
        ? `const s=await p.snapshot({scope:'full_page'});if(!s.includes('text "笔记含AI合成内容"')){await p.click('text="添加内容类型声明"');await p.click('text="笔记含AI合成内容"');}`
        : ''),
    bilibili: yes
      ? `const val=await p.evaluate(()=>document.querySelector('input[placeholder="请选择符合您视频内容的创作声明"]').value);if(val!=='含AI生成内容'){await p.click('input[placeholder="请选择符合您视频内容的创作声明"]');await p.click('text="含AI生成内容"');}`
      : '',
    youtube:
      `await p.click('text="不，内容不是面向儿童的"');` +
      (yes
        ? `const s=await p.snapshot({scope:'full_page'});if(s.includes('button "显示高级设置"'))await p.click('loc=role:button[name="显示高级设置"]');await p.click('[role=radio][name="VIDEO_HAS_ALTERED_CONTENT_YES"]');`
        : ''),
  };
  if (category && cfg.categories.includes(category))
    scripts[cfg.id] +=
      `const selected=await p.evaluate(()=>document.querySelector('.select-controller')?.textContent.trim());if(selected!==${JSON.stringify(category)}){await p.click('.select-controller');await p.click(${JSON.stringify('text=' + JSON.stringify(category) + ' >> nth=0')});}`;
  if (!(cfg.id in scripts)) throw Error('平台设置未接通');
  await publishingPageCall(page, scripts[cfg.id] + `console.log('WORKSPACE_RESULT:true');`);
}

export async function waitPublishingAccount(page: UploadPage, cfg: UploadPlatform) {
  await publishingPageCall(
    page,
    `try{await p.waitForFunction(id=>document.body.innerText.includes(id)||location.href.includes(id)||[...document.querySelectorAll('a[href]')].some(a=>a.href.includes(id)),${JSON.stringify(cfg.accountId)},{timeout:15000});}catch{}console.log('WORKSPACE_RESULT:true');`,
  );
}
