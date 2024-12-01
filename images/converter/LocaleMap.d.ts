type Equal<A, B> =
  (<T>() => T extends A ? 0 : 1) extends <T>() => T extends B ? 0 : 1
    ? true
    : false;

/** テンプレート文字列を固定文字列とプレースホルダーの配列に分割 */
type Tokenize<S extends string> =
  // 次の`$`を検索
  S extends `${infer PRE}$${infer POST}`
    ? // `$`の次の文字も`$`だったら`$$`を固定文字列`$`として次を検索
      POST extends `$${infer REST}`
      ? [`${PRE}$`, ...Tokenize<REST>]
      : // `$`の次が`{～}`だったらプレースホルダーと見なしてKEYを取得
        POST extends `{${infer KEY}}${infer REST}`
        ? // KEYが空文字列の場合は`${}`までを固定文字列として次を検索
          KEY extends ''
          ? [`${PRE}\${}`, ...Tokenize<REST>]
          : // KEYが`$`、`{`を含んでいる場合は不完全なプレースホルダーなので`${`までを固定文字列として次を検索
            KEY extends `${string}${'$' | '{'}${string}`
            ? [`${PRE}\${`, ...Tokenize<`${KEY}}${REST}`>]
            : // プレースホルダーはそのキーを配列にして次を検索
              [PRE, [KEY], ...Tokenize<REST>]
        : // `$`の次が`$`でも`{～}`でもなければ`$`までを固定文字列として次を検索
          [`${PRE}$`, ...Tokenize<POST>]
    : // `$`が見つからなければ固定文字列とする
      [S];

/** プレースホルダーのキーを抽出する */
type PlaceHolderKey<TOKEN> = TOKEN extends [infer KEY]
  ? KEY extends string
    ? KEY
    : never
  : never;

/** テンプレート文字列からプレースホルダーのキーを抽出する */
type TemplateParameters<S extends string> = PlaceHolderKey<
  Exclude<Tokenize<S>[number], string>
>;

/** プレースホルダーを`${string}`に置き換えたテンプレートリテラル型を生成する。 */
type ConcatTokens<TOKENS extends (string | [string])[]> = TOKENS extends [
  infer F,
  ...infer R,
]
  ? R extends (string | [string])[]
    ? `${F extends string ? F : string}${ConcatTokens<R>}`
    : never
  : '';

/** テンプレート文字列のプレースホルダー部分を`${string}`に置き換えたテンプレートリテラル型を生成する。 */
type ParameterizedTemplate<S extends string> = ConcatTokens<Tokenize<S>>;

/** 言語ごとの文言マッピングにプレースホルダーの過不足がないかチェックする */
type ValidationLocaleMap<MAP extends Record<string, string>> = {
  readonly [KEY in keyof MAP & string]: Equal<
    TemplateParameters<KEY>,
    TemplateParameters<MAP[KEY]>
  > extends true
    ? // ローカライズ前後でプレースホルダーのキーが一致すればそのまま
      MAP[KEY]
    : // 一致しなければエラーメッセージと差分を型に載せる
      string &
        [
          'parameter(s) not match:',
          (
            | Exclude<TemplateParameters<KEY>, TemplateParameters<MAP[KEY]>>
            | Exclude<TemplateParameters<MAP[KEY]>, TemplateParameters<KEY>>
          ),
        ];
};

/** すべての言語の文言マッピングにプレースホルダーの過不足がないかチェックする */
export type ValidationLocaleMaps<
  MAPS extends Record<string, Record<string, string>>,
> = {
  [LOCALE in keyof MAPS]: ValidationLocaleMap<MAPS[LOCALE]>;
};

/** テンプレート文字列に必要なパラメーターを生成する。 */
type LocalizeParameter<KEY extends string> = [TemplateParameters<KEY>] extends [
  never,
]
  ? // KEYがプレースホルダーを持たなければ引数追加無し
    []
  : // プレースホルダーを持つなら必須引数として追加する
    [params: Record<TemplateParameters<KEY>, string>];

/** メッセージをロケールに応じた文言に変換する関数の型 */
export type LocalizeFunction<MAPS extends Record<string, Record<string, string>>> = {
  <KEY extends string & keyof MAPS[keyof MAPS]>(
    key: KEY,
    ...args: LocalizeParameter<KEY>
  ): ParameterizedTemplate<KEY> | (string & {});
  /** @deprecated MAPSに存在しないメッセージです。 */
  <MESSAGE extends string>(
    message: MESSAGE,
    ...args: LocalizeParameter<MESSAGE>
  ): MESSAGE;
  locale?: string;
};
