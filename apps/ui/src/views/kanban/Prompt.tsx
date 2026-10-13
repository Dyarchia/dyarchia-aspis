import { Button, Dialog, TextArea } from "@dyarchia/aspis";
import { useEffect, useState } from "react";

export interface PromptRequest {
    title: string;
    label: string;
    action: string;
    submit: (text: string) => void;
}

export function Prompt({ request, onClose }: { request?: PromptRequest; onClose: () => void }) {
    const [text, setText] = useState("");
    useEffect(() => setText(""), [request]);
    const confirm = () => {
        if (!request || !text.trim()) return;
        request.submit(text.trim());
        onClose();
    };
    return (
        <Dialog
            open={Boolean(request)}
            onClose={onClose}
            placement="center"
            title={request?.title}
            footer={
                <>
                    <Button variant="quiet" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button variant="primary" disabled={!text.trim()} onClick={confirm}>
                        {request?.action}
                    </Button>
                </>
            }
        >
            <TextArea
                label={request?.label ?? ""}
                autoFocus
                value={text}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) confirm();
                }}
                hint="Ctrl Enter to confirm"
            />
        </Dialog>
    );
}
