import { runMain } from "citty";
import { actorRoutes } from "./actors.ts";
import { cli } from "./main.ts";

void runMain(cli(actorRoutes));
