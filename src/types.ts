/**
 * プロンプト構造管理マネージャーの基底となるアイテム定義
 * グループとプロンプト（葉ノード）の両方を表現します。
 */
export interface PsmItem {
  /** ユニークID (Date.now() + Math.random()) */
  id: number;
  /** 表示名 (グループ名やプロンプトの別名) */
  name: string;
  /** プロンプト内容 (タグ) */
  content: string; // グループの場合は空文字の場合が多いが、便宜上存在
  /** 有効/無効フラグ (無効時はプロンプト生成に含まれない) */
  enabled: boolean;
  /** 重み (Attention) 係数 (1.0が標準) */
  weight: number;
  /** ユーザー用のメモ書き */
  memo: string;
  /** trueならグループ（フォルダ）、falseならプロンプト（葉） */
  is_group: boolean;
  /** UI上の開閉状態 (グループの場合のみ有効) */
  isOpen?: boolean; // UI状態制御用
  /** 子要素のリスト (グループの場合のみ存在) */
  children?: PsmItem[];
  isRandom?: boolean;
  isExclusive?: boolean;
  /**
   * 自然言語アイテムフラグ (Anima等の自然言語プロンプト用)
   * trueの場合、コンパイル時にアンダースコア置換・括弧エスケープ・末尾カンマ除去をスキップし原文のまま出力する
   */
  isNatural?: boolean;
  /**
   * 翻訳前の原文 (自然言語アイテム用)
   * コンパイル出力には一切含まれない。翻訳機能 (Phase 2.5) が参照する
   */
  sourceText?: string;
  /**
   * タグカテゴリ (グループ用・Phase 3)
   * animaモード時、ルート直下をカテゴリ優先度で安定ソートして出力する。
   * 未指定は "general" 扱い (既存YAMLの出力順は変わらない)
   */
  category?: PsmCategory;
  /**
   * グループヘッダの背景色 (グループ用・任意)
   * CSSカラー文字列 (例: "#7f1d1d")。未指定はデフォルト背景
   */
  headerColor?: string;
  /**
   * グループロックフラグ (グループ用・Phase 7)
   * trueの場合、自身および配下の全アイテム（サブグループ含め再帰的）が
   * 有効/無効の切り替えを含め一切編集できなくなる
   */
  isLocked?: boolean;
  /**
   * グループ非表示フラグ (グループ用・Phase 8)
   * trueの場合、サイドバーの「非表示グループの表示」がOFFの間はツリーに表示されない
   */
  isHidden?: boolean;
}

/**
 * タグカテゴリ (Anima推奨のタグ順序に対応)
 * quality(品質/メタ/年代/安全) → subject(1girl等) → character → series → artist → general
 */
export type PsmCategory = "quality" | "subject" | "character" | "series" | "artist" | "general";

/**
 * 翻訳プロバイダの種別
 * - "openai": OpenAI互換API (Ollama / LM Studio / llama.cpp / OpenAI / OpenRouter 等)
 * - "deepl":  DeepL API
 */
export type TranslateProvider = "openai" | "deepl";

/** 翻訳プロファイル (ローカル/クラウドそれぞれの設定一式) */
export interface TranslateProfile {
  provider: TranslateProvider;
  endpoint: string;
  model: string;
  api_key: string;
  timeout_sec: number;
  system_prompt: string;
}

/**
 * 翻訳設定 (localStorage "psm_translate_settings" に保存)
 * ローカル/クラウドの2プロファイルを常時保持し、activeで切り替える
 */
export interface TranslateSettings {
  active: "local" | "cloud";
  local: TranslateProfile;
  cloud: TranslateProfile;
}

/**
 * 対象モデルのモード (YAMLファイル単位で保存)
 * - "sd": SD系 (従来動作)
 * - "anima": Anima (自然言語・スコアタグ等を考慮)
 */
export type ModelMode = "sd" | "anima";

export interface PsmProfileState {
  id: number;
  enabled: boolean;
  weight: number;
}

export interface PsmProfile {
  name: string;
  states: PsmProfileState[];
}


/**
 * 重複プロンプトのチェック設定モード
 */
export type DuplicateCheckMode = "none" | "warn" | "error";

/** 重複プロンプトの1か所を含む、ルートから親までのグループ (重複の一覧ダイアログで場所を示すために使う) */
export interface DuplicatePathGroup {
  id: number;
  name: string;
  isRandom: boolean;
}

/** 重複しているプロンプトの1か所 */
export interface DuplicateOccurrence {
  item: PsmItem;
  pane: "positive" | "negative";
  /** ルートから親までのグループ (外側から順。ルート直下のプロンプトは空) */
  groups: DuplicatePathGroup[];
  /** 自身または祖先グループがロック中のため、無効にできない */
  locked: boolean;
}

/** 同じ内容で重複しているプロンプトのまとまり (text は前後の空白と末尾のカンマを除いた内容) */
export interface DuplicateGroup {
  text: string;
  occurrences: DuplicateOccurrence[];
}

/**
 * ツリーの表示フィルター (ツールバーで両ペイン共通に切り替える。保存はせず、読み込み時は "all")
 * - "all": 無効なプロンプトも含めてすべて表示する
 * - "enabled": 実際に反映される (自身と祖先がすべて有効な) プロンプトだけを、グループの枠なしで並べる
 * - "enabledWithGroups": 実際に反映されるプロンプトを、それを含むグループの枠の中に表示する
 */
export type ViewFilterMode = "all" | "enabled" | "enabledWithGroups";

/**
 * 親グループが無効な項目を有効にしようとしたときの挙動 (localStorage "psm_settings" に保存)
 * - "none": 何もしない (反映されない理由だけを通知する)
 * - "confirm": 通知で確認し、「親も有効にする」が押された場合のみ祖先グループも有効にする
 * - "auto": 祖先グループも自動で有効にし、通知から元に戻せるようにする
 */
export type ParentActivationMode = "none" | "confirm" | "auto";

/** 有効/無効を変更したアイテムの、変更前の状態 (元に戻す用) */
export interface EnabledChange {
  id: number;
  previous: boolean;
}

/**
 * 親グループが無効な項目を有効にしようとしたときの通知内容
 * groupNames は無効だった祖先グループの名前で、外側から順に並ぶ
 * - "blocked": 何も変更していない (反映されない理由の通知のみ)
 * - "confirm": 祖先グループも有効にするかの確認待ち
 * - "activated": 祖先グループも有効にした (changes を使って元に戻せる)
 */
export type ParentActivationNotice =
  | { kind: "blocked"; itemId: number; groupNames: string[] }
  | { kind: "confirm"; itemId: number; groupNames: string[] }
  | {
      kind: "activated";
      itemId: number;
      groupNames: string[];
      /** 対象以外に、新たにプロンプトへ反映されるようになったプロンプトの件数 */
      extraCount: number;
      changes: EnabledChange[];
    };

/**
 * 生成設定プロファイルが管理できる項目のID (Phase 6)
 * WebUIのCheckpoint/Sampling Steps等のうち、どの項目を保存・適用の対象にするかを表す。
 * VAE / Sampling Method / Schedule Type はWebUI側のドロップダウン実装の都合上、
 * 自動適用を確実に行えないため対象外としている（保存専用の項目は設けない方針）。
 */
export type GenerationFieldId =
  | "checkpoint"
  | "steps"
  | "cfg_scale"
  | "width"
  | "height"
  | "seed";

/**
 * 生成設定の値の集合 (プロファイルの fields に含まれるキーのみ値を持つ)
 */
export interface PsmGenerationSettings {
  checkpoint?: string;
  steps?: number;
  cfg_scale?: number;
  width?: number;
  height?: number;
  seed?: number;
}

/**
 * 生成設定プロファイル (名前を付けて保存する、WebUI生成設定のスナップショット)
 * プロンプトのメインYAMLとは独立した generation_profiles.json に保存される
 */
export interface PsmGenerationProfile {
  name: string;
  fields: GenerationFieldId[];
  settings: PsmGenerationSettings;
  updatedAt: string;
}
