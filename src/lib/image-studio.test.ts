import { test, expect, vi } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { initializeDatabase } from '../db/database';
import { contents, assets, imageStudioTurns } from '../db/schema';
import { runImageChat, recoverStoppedStudioChats } from './image-chat-store';
import * as skillStore from './image-chat-skills';
import { imageChatMessages } from '../ai/image-chat';

test('独立封面对话不建作品：原文和技能独立传递，原图入库、续聊和重复请求均可追踪', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'cover-studio-fixture-'));
  const db = await initializeDatabase(path.join(folder, 'db'));
  const savedFiles: string[] = [];
  try {
    await writeFile(
      path.join(folder, 'SKILL.md'),
      '---\nname: fixture-cover\ndescription: 隔离测试技能\n---\n按用户原文生成测试图。',
    );
    const skill = (await skillStore.loadImageChatSkills([folder]))[0];
    vi.spyOn(skillStore, 'resolveImageChatSkill').mockImplementation(async (id) => {
      if (!id) return null;
      if (id === skill.id) return skill;
      throw Error('所选技能已不存在');
    });
    expect(skill).toBeTruthy();
    const file = path.join(folder, 'fixture.png');
    await writeFile(
      file,
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=',
        'base64',
      ),
    );
    const input = {
      id: randomUUID(),
      sessionId: randomUUID(),
      text: '  原样提示词\n3:4、4:3、16:9 不加模板  ',
      skillId: skill.id,
      purposeId: 'video_cover',
      referenceIds: [],
    };
    const turn = await runImageChat(
      db,
      input,
      () => {},
      async (call) => {
        expect(call.text).toBe(input.text);
        expect(call.skill?.instructions).toBe(skill.instructions);
        const messages = imageChatMessages(call);
        expect(messages.at(-1)?.text).toBe(input.text);
        expect(messages[1].text).toContain(skill.path);
        expect(messages[1].text).toContain(skill.instructions);
        call.onThread('fixture-thread');
        return { threadId: 'fixture-thread', text: 'fixture', files: [file] };
      },
    );
    const stored = db.db.select().from(assets).all();
    savedFiles.push(...stored.map((a) => a.path));
    expect(db.db.select().from(contents).all()).toEqual([]);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      contentId: null,
      purposeId: 'video_cover',
      width: 1,
      height: 1,
      prompt: input.text,
    });
    expect(await readFile(stored[0].path)).toEqual(await readFile(file));
    expect(turn.assetIds).toEqual([stored[0].id]);
    expect(db.db.select().from(imageStudioTurns).all()[0].skillName).toBe(skill.name);
    await runImageChat(
      db,
      input,
      () => {},
      async () => {
        throw Error('不得重复调用');
      },
    );
    await expect(runImageChat(db, { ...input, skillId: null }, () => {})).rejects.toThrow('请求编号');
    await runImageChat(
      db,
      { ...input, id: randomUUID(), skillId: null },
      () => {},
      async (call) => {
        expect(call.threadId).toBe('fixture-thread');
        expect(call.skill).toBeNull();
        return { threadId: 'fixture-thread', text: '继续修改', files: [] };
      },
    );
    await expect(runImageChat(db, { ...input, id: randomUUID(), skillId: '../../other' }, () => {})).rejects.toThrow(
      '技能已不存在',
    );
    await expect(
      runImageChat(
        db,
        { ...input, id: randomUUID() },
        () => {},
        async () => {
          throw Error('fixture model error');
        },
      ),
    ).rejects.toThrow('fixture model error');
    expect(db.db.select().from(imageStudioTurns).all().at(-1)?.error).toBe('fixture model error');
    const stoppedId = randomUUID();
    db.db
      .insert(imageStudioTurns)
      .values({
        id: stoppedId,
        contentId: input.sessionId,
        input: 'fixture interrupted',
        purposeId: 'video_cover',
        referenceIds: [],
        output: '已完成部分',
        status: 'running',
        assetIds: [stored[0].id],
        createdAt: 'fixture',
        updatedAt: 'fixture',
      })
      .run();
    await recoverStoppedStudioChats(db);
    expect(
      db.db
        .select()
        .from(imageStudioTurns)
        .all()
        .find((t) => t.id === stoppedId),
    ).toMatchObject({ status: 'failed', output: '已完成部分', assetIds: [stored[0].id] });
  } finally {
    vi.restoreAllMocks();
    db.sqlite.close();
    await Promise.all(savedFiles.map((file) => rm(file, { force: true })));
    await rm(folder, { recursive: true, force: true });
  }
});
