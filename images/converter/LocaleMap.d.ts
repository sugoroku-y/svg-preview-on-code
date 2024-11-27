type Equal<A, B> =
  (<T>() => T extends A ? 0 : 1) extends <T>() => T extends B ? 0 : 1
    ? true
    : false;
type TemplateParameters<S extends string> = S extends `${string}$${infer REST}`
  ? REST extends `$${infer REST_EXCAPED_DOLLAR}`
    ? TemplateParameters<REST_EXCAPED_DOLLAR>
    : REST extends `{${infer KEY}}${infer REST_POST_KEY}`
      ? KEY extends `${string}${'$' | '{' | '}'}${string}`
        ? never
        : KEY | TemplateParameters<REST_POST_KEY>
      : never
  : never;
type ParameterizedTemplate<S extends string, A extends string = S> = [
  S,
] extends [never]
  ? string
  : S extends S
    ? `${string}\${${S}}${ParameterizedTemplate<Exclude<A, S>>}`
    : never;
type ValidationLocaleMap<Map extends Record<string, string>> = {
  readonly [K in keyof Map]: K extends string
    ? Equal<TemplateParameters<K>, TemplateParameters<Map[K]>> extends true
      ? Map[K]
      : string &
          [
            'parameter(s) not match:',
            (
              | Exclude<TemplateParameters<K>, TemplateParameters<Map[K]>>
              | Exclude<TemplateParameters<Map[K]>, TemplateParameters<K>>
            ),
          ]
    : never;
};
export type ValidationLocaleMaps<
  Maps extends Record<string, Record<string, string>>,
> = {
  [K in keyof Maps]: ValidationLocaleMap<Maps[K]>;
};

type LocalizeParameter<KEY extends string> = [TemplateParameters<KEY>] extends [
  never,
]
  ? []
  : [Record<TemplateParameters<KEY>, string>];

export type Localizer<Maps extends Record<string, Record<string, string>>> = {
  <Key extends string & keyof Maps[keyof Maps]>(
    key: Key,
    ...args: LocalizeParameter<Key>
  ): string;
  locale: string;
};
