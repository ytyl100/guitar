import { CompilerType, CSSType, FrameworkType, NpmType } from '@tarojs/binding';
import Creator from './creator';
import type { ITemplates } from './fetchTemplate';
export interface IProjectConf {
    projectName: string;
    projectDir: string;
    npm: NpmType;
    templateSource: string;
    clone?: boolean;
    template: string;
    description?: string;
    typescript?: boolean;
    buildEs5?: boolean;
    css: CSSType;
    date?: string;
    src?: string;
    sourceRoot?: string;
    env?: string;
    autoInstall?: boolean;
    hideDefaultTemplate?: boolean;
    framework: FrameworkType;
    compiler?: CompilerType;
    ask?: (config: object) => Promise<void> | void;
    /**
     * 内部标记：由 `taro init .` / `./` 触发。
     * 表示目标目录即当前工作目录，projectName 已被解析为当前目录名。
     * 仅在 CLI 内部流转，不会传递给底层 createProject。
     */
    initInCurrentDir?: boolean;
}
type CustomPartial<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
type IProjectConfOptions = CustomPartial<IProjectConf, 'projectName' | 'projectDir' | 'template' | 'css' | 'npm' | 'framework' | 'templateSource'>;
interface AskMethods {
    (conf: IProjectConfOptions, prompts: Record<string, unknown>[], choices?: ITemplates[]): void;
}
export default class Project extends Creator {
    rootPath: string;
    conf: IProjectConfOptions;
    constructor(options: IProjectConfOptions);
    init(): void;
    create(): Promise<void>;
    ask(): Promise<{
        projectName: string;
        projectDir: string;
        npm: NpmType;
        templateSource: string;
        clone?: boolean | undefined;
        template: string;
        description?: string | undefined;
        typescript?: boolean | undefined;
        buildEs5?: boolean | undefined;
        css: CSSType;
        date?: string | undefined;
        src?: string | undefined;
        sourceRoot?: string | undefined;
        env?: string | undefined;
        autoInstall?: boolean | undefined;
        hideDefaultTemplate?: boolean | undefined;
        framework: FrameworkType;
        compiler?: CompilerType | undefined;
        ask?: ((config: object) => void | Promise<void>) | undefined;
        initInCurrentDir?: boolean | undefined;
    }>;
    askProjectName: AskMethods;
    askDescription: AskMethods;
    askTypescript: AskMethods;
    askBuildEs5: AskMethods;
    askCSS: AskMethods;
    askCompiler: AskMethods;
    askFramework: AskMethods;
    askTemplateSource: AskMethods;
    askTemplate: AskMethods;
    askNpm: AskMethods;
    fetchTemplates(answers: IProjectConf): Promise<ITemplates[]>;
    write(cb?: () => void): void;
}
export {};
