import { join } from "node:path";
import { Kanban, Store } from "../../packages/store/src/index.ts";

const store = new Store(join(process.env.ASPIS_HOME!, "state.db"));
new Kanban(store).create(process.argv[2] ?? "Written from another process");
store.close();
