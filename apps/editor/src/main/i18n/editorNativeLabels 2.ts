import type { EditorLanguage } from '../../shared/editorSettingsProtocol';

export type EditorNativeLabels = {
  menu: {
    file: string;
    newProject: string;
    openProject: string;
    saveProject: string;
    edit: string;
    undo: string;
    redo: string;
    cut: string;
    copy: string;
    paste: string;
    selectAll: string;
    quit: string;
  };
  project: {
    openTitle: string;
    openButton: string;
    saveLocationTitle: string;
    createFolderButton: string;
    saveLocationMessage: (projectName: string, manifestName: string) => string;
  };
  asset: {
    nouns: { image: string; video: string; audio: string };
    importTitle: (noun: string) => string;
    importButton: (noun: string) => string;
  };
  export: {
    standaloneTitle: string;
    webTitle: string;
    bundleTitle: string;
    button: string;
    webFilter: string;
    macFilter: string;
  };
  window: {
    untitledProject: string;
    unsaved: string;
  };
};

const zhCN: EditorNativeLabels = {
  menu: {
    file: '文件',
    newProject: '新建项目',
    openProject: '打开项目…',
    saveProject: '保存项目',
    edit: '编辑',
    undo: '撤销',
    redo: '重做',
    cut: '剪切',
    copy: '复制',
    paste: '粘贴',
    selectAll: '全选',
    quit: '退出',
  },
  project: {
    openTitle: '打开 VN Engine 项目',
    openButton: '打开项目',
    saveLocationTitle: '选择项目保存位置',
    createFolderButton: '创建项目文件夹',
    saveLocationMessage: (projectName: string, manifestName: string) =>
      `将在所选位置创建“${projectName}”项目文件夹，内部清单固定为 ${manifestName}`,
  },
  asset: {
    nouns: { image: '图片', video: '视频', audio: '音频' },
    importTitle: (noun: string) => `导入${noun}资源`,
    importButton: (noun: string) => `导入${noun}`,
  },
  export: {
    standaloneTitle: '导出独立游戏 ZIP',
    webTitle: '导出 Web 游戏 ZIP',
    bundleTitle: '导出 VN 游戏内容包',
    button: '导出',
    webFilter: 'Web 游戏 ZIP',
    macFilter: 'macOS 游戏 ZIP',
  },
  window: {
    untitledProject: '未命名项目',
    unsaved: '未保存',
  },
};

const enUS: EditorNativeLabels = {
  menu: {
    file: 'File',
    newProject: 'New Project',
    openProject: 'Open Project…',
    saveProject: 'Save Project',
    edit: 'Edit',
    undo: 'Undo',
    redo: 'Redo',
    cut: 'Cut',
    copy: 'Copy',
    paste: 'Paste',
    selectAll: 'Select All',
    quit: 'Quit',
  },
  project: {
    openTitle: 'Open VN Engine Project',
    openButton: 'Open Project',
    saveLocationTitle: 'Choose Project Save Location',
    createFolderButton: 'Create Project Folder',
    saveLocationMessage: (projectName: string, manifestName: string) =>
      `A “${projectName}” project folder will be created in the selected location. Its manifest is always named ${manifestName}.`,
  },
  asset: {
    nouns: { image: 'Image', video: 'Video', audio: 'Audio' },
    importTitle: (noun: string) => `Import ${noun} Asset`,
    importButton: (noun: string) => `Import ${noun}`,
  },
  export: {
    standaloneTitle: 'Export Standalone Game ZIP',
    webTitle: 'Export Web Game ZIP',
    bundleTitle: 'Export VN Game Bundle',
    button: 'Export',
    webFilter: 'Web Game ZIP',
    macFilter: 'macOS Game ZIP',
  },
  window: {
    untitledProject: 'Untitled Project',
    unsaved: 'Unsaved',
  },
};

export function getEditorNativeLabels(
  language: EditorLanguage,
): EditorNativeLabels {
  return language === 'en-US' ? enUS : zhCN;
}
