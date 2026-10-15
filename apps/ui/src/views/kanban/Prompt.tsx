import { Button, Dialog, TextArea } from "@dyarchia/aspis";
import { useEffect, useState } from "react";

export interface PromptRequest {
    title: string;
    label: string;
    hint?: string;
    action: string;
    validate?: (text: string) => string | undefined;
    submit: (text: string) => void;
}

export function Prompt({ request, onClose }: { request?: PromptRequest; onClose: () => void }) {
    const [text, setText] = useState("");
    const [tried, setTried] = useState(false);
    useEffect(() => {
        setText("");
        setTried(false);
    }, [request]);
    const error = request?.validate?.(text.trim());
    const confirm = () => {
        setTried(true);
        if (!request || !text.trim() || error) return;
        request.submit(text.trim());
        onClose();
    };
    return (
        <Dialog
            open={Boolean(request)}
            onClose={onClose}
            placement="center"
            title={request?.title ?? ""}
            footer={
                <>
                    <Button variant="quiet" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button variant="primary" hotkey="Ctrl Enter" disabled={!text.trim()} onClick={confirm}>
                        {request?.action}
                    </Button>
                </>
            }
        >
            <TextArea
                label={request?.label ?? ""}
                hint={request?.hint}
                error={tried && text.trim() ? error : undefined}
                autoFocus
                rows={3}
                value={text}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) confirm();
                }}
            />
        </Dialog>
    );
}
