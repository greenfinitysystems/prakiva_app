import type { InlineChannelEditorProps } from './types';
import { editorRegistry } from '../../config/editor-registry';

const InlineChannelEditor: React.FC<InlineChannelEditorProps> = props => {
    const Editor = editorRegistry[props.policy];
    return <Editor {...props} />;
};

export default InlineChannelEditor;
