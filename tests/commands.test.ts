import { describe, expect, it, vi } from 'vitest';
import { registerCommands } from '../src/commands';
import type FitnessLogPlugin from '../src/main';
import { Plugin } from './__mocks__/obsidian';

describe('registerCommands', () => {
	it('計画どおりの id でコマンドを登録する（名前にプラグイン名を含めない）', () => {
		const plugin = new Plugin() as unknown as FitnessLogPlugin;
		registerCommands(plugin);
		const commands = (plugin as unknown as Plugin).commands as Array<{
			id: string;
			name: string;
		}>;
		expect(commands.map((c) => c.id)).toEqual([
			'open-today',
			'open-log',
			'setup',
			'create-bases-file',
		]);
		for (const command of commands)
			expect(command.name).not.toMatch(/fitness/i);
	});

	it('Bases ファイルの作成はサービスに委ねる', () => {
		const plugin = new Plugin() as unknown as FitnessLogPlugin;
		const createBasesFile = vi.fn();
		plugin.services = {
			createBasesFile,
		} as unknown as FitnessLogPlugin['services'];
		registerCommands(plugin);
		const command = (
			(plugin as unknown as Plugin).commands as Array<{
				id: string;
				callback: () => void;
			}>
		).find((c) => c.id === 'create-bases-file');
		command?.callback();
		expect(createBasesFile).toHaveBeenCalledTimes(1);
	});
});
