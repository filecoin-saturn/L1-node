import Debug from "debug";
import { NETWORK } from "../config.js";

export const debug = Debug(`node@${NETWORK}net`);
