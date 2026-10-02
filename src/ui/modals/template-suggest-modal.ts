import { FuzzySuggestModal, type App, type FuzzyMatch } from 'obsidian';
import { t } from '../../i18n';
import {
	PROGRAM_TEMPLATES,
	type ProgramTemplate,
	type SessionTemplate,
} from '../../lib/model/defaults';

interface TemplateChoice {
	program: ProgramTemplate;
	/** null はプログラム全体 */
	session: SessionTemplate | null;
}

/** 内蔵テンプレート（Notion のプログラム）からパッケージを選ぶ */
export class TemplateSuggestModal extends FuzzySuggestModal<TemplateChoice> {
	constructor(
		app: App,
		private readonly onChoose: (
			programId: string,
			sessionName: string | null,
		) => void,
	) {
		super(app);
		this.setPlaceholder(t('packages.templatePlaceholder'));
	}

	getItems(): TemplateChoice[] {
		return PROGRAM_TEMPLATES.flatMap((program) => [
			{ program, session: null },
			...program.sessions.map((session) => ({ program, session })),
		]);
	}

	getItemText(choice: TemplateChoice): string {
		return choice.session
			? `${choice.program.name} ${choice.session.name}`
			: choice.program.name;
	}

	renderSuggestion(match: FuzzyMatch<TemplateChoice>, el: HTMLElement): void {
		const { program, session } = match.item;
		el.addClass('fitness-log-suggestion');
		if (!session) {
			el.createDiv({
				cls: 'fitness-log-suggestion-title',
				text: t('packages.templateAll', {
					program: program.name,
					count: program.sessions.length,
				}),
			});
			return;
		}
		el.createDiv({
			cls: 'fitness-log-suggestion-title',
			text: `${program.name} ／ ${session.name}`,
		});
		el.createDiv({
			cls: 'fitness-log-suggestion-note',
			text: session.rows.map(([name]) => name).join('、'),
		});
	}

	onChooseItem(choice: TemplateChoice): void {
		this.onChoose(choice.program.id, choice.session?.name ?? null);
	}
}
