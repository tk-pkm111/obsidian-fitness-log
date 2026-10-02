/** 種目・パッケージ・ルーチンの操作で利用者に見せるエラー（Notice やモーダルにそのまま出す） */
export class CatalogError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CatalogError';
	}
}

/** 本名・別名が他の種目と重なっていないか（重なればその種目） */
