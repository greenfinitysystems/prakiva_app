import type { InlineChannelEditorProps } from './types';
import { editorRegistry } from '../../config/editor-registry';

const InlineChannelEditor: React.FC<InlineChannelEditorProps> = props => {
    const Editor = editorRegistry[props.policy];
    // Curve policies are rendered by the unified multi-channel editor on ControlEditorPage.
    if (!Editor) return null;
    return <Editor {...props} />;
};

export default InlineChannelEditor;
