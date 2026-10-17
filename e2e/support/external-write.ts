import { join } from "node:path";
import { Kanban, Store } from "../../packages/store/src/index.ts";

const store = new Store(join(process.env.ASPIS_HOME!, "state.db"));
const kanban = new Kanban(store);
kanban.create(process.argv[2] ?? "Written from another process", kanban.boards().find((board) => board.name === "ivirma-crm")!.id);
store.close();
