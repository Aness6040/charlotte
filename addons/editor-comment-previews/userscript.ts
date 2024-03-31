interface VMBlock {
    id: string;
    parent: string | null;
    opcode: string;
    mutation?: {
        proccode: string;
    },
    inputs: {
        [inputName: string]: {
            shadow: string | null;
            block: string | null;
        }
    }
}

export default async function ({ addon, settings }) {
    const vm = await addon.api.getVM();

    const updateStyles = (_?: string, __?: string) => {
        previewInner.classList.toggle('sa-comment-preview-delay', settings.get('delay') !== 'none');
        previewInner.classList.toggle('sa-comment-preview-reduce-transparency', settings.get('reduce-transparency'));
        previewInner.classList.toggle('sa-comment-preview-fade', !settings.get('reduce-animation'));
    };

    const afterDelay = (cb) => {
        if (!previewInner.classList.contains('sa-comment-preview-hidden')) {
            // If not hidden, updating immediately is preferred
            cb();
            return;
        }
        const delay = settings.get('delay');
        if (delay === 'long') return setTimeout(cb, 500);
        if (delay === 'short') return setTimeout(cb, 300);
        cb();
    };

    let hoveredElement = null;
    let showTimeout = null;
    let mouseX = 0;
    let mouseY = 0;
    let doNotShowUntilMoveMouse = false;

    const previewOuter = document.createElement('div');
    previewOuter.classList.add('sa-comment-preview-outer');
    const previewInner = document.createElement('div');
    previewInner.classList.add('sa-comment-preview-inner');
    previewInner.classList.add('sa-comment-preview-hidden');
    updateStyles();
    settings.on('change', updateStyles);

    previewOuter.appendChild(previewInner);
    document.body.appendChild(previewOuter);

    const getBlock = (id) => vm.editingTarget.blocks.getBlock(id) || vm.runtime.flyoutBlocks.getBlock(id);
    const getComment = (block) => block && block.comment && vm.editingTarget.comments[block.comment];
    const getProcedureDefinitionBlock = (procCode: string) => {
        const procedurePrototype = Object.values(vm.editingTarget.blocks._blocks).find(
            (i: VMBlock) => i.opcode === 'procedures_prototype' && i.mutation.proccode === procCode
        ) as VMBlock | null;
        if (procedurePrototype) {
            // Usually `parent` will exist but sometimes it doesn't
            if (procedurePrototype.parent) {
                return getBlock(procedurePrototype.parent);
            }
            const id = procedurePrototype.id;
            return Object.values(vm.editingTarget.blocks._blocks).find(
                (i: VMBlock) => i.opcode === 'procedures_definition' && i.inputs.custom_block && i.inputs.custom_block.block === id
            );
        }
        return null;
    };

    const setText = (text) => {
        previewInner.innerText = text;
        previewInner.classList.remove('sa-comment-preview-hidden');
        updateMousePosition();
    };

    const updateMousePosition = () => {
        previewOuter.style.transform = `translate(${mouseX + 8}px, ${mouseY + 8}px)`;
    };

    const hidePreview = () => {
        if (hoveredElement) {
            hoveredElement = null;
            previewInner.classList.add('sa-comment-preview-hidden');
        }
    };

    document.addEventListener('mouseover', (e) => {
        clearTimeout(showTimeout);
        if (doNotShowUntilMoveMouse) {
            return;
        }

        const el: HTMLElement = (e.target as HTMLElement).closest('.blocklyBubbleCanvas > g, .blocklyBlockCanvas .blocklyDraggable[data-id]');
        if (el === hoveredElement) {
            // Nothing to do.
            return;
        }
        if (!el) {
            hidePreview();
            return;
        }

        let text = null;
        if (
            settings.get('hover-view') &&
      (e.target as HTMLElement).closest('.blocklyBubbleCanvas > g') &&
      // Hovering over the thin line that connects comments to blocks should never show a preview
      !(e.target as HTMLElement).closest('line')
        ) {
            const collapsedText = el.querySelector('text.scratchCommentText');
            if (collapsedText.getAttribute('display') !== 'none') {
                const textarea = el.querySelector('textarea');
                text = textarea.value;
            }
        } else if ((e.target as HTMLElement).closest('.blocklyBlockCanvas .blocklyDraggable[data-id]')) {
            const id = el.dataset.id;
            const block = getBlock(id);
            const comment = getComment(block);
            if (settings.get('hover-view-block') && comment) {
                text = comment.text;
            } else if (block && block.opcode === 'procedures_call' && settings.get('hover-view-procedure')) {
                const procCode = block.mutation.proccode;
                const procedureDefinitionBlock = getProcedureDefinitionBlock(procCode);
                const procedureComment = getComment(procedureDefinitionBlock);
                if (procedureComment) {
                    text = procedureComment.text;
                }
            }
        }

        if (text !== null && text.trim() !== '') {
            showTimeout = afterDelay(() => {
                hoveredElement = el;
                setText(text);
            });
        } else {
            hidePreview();
        }
    });

    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
        doNotShowUntilMoveMouse = false;
        if (settings.get('follow-mouse') && !previewInner.classList.contains('sa-comment-preview-hidden')) {
            updateMousePosition();
        }
    });

    document.addEventListener(
        'mousedown',
        () => {
            hidePreview();
            doNotShowUntilMoveMouse = true;
        },
        {
            capture: true
        }
    );
}
