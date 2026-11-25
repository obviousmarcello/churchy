import { describe, expect, it } from "vitest";

import {
  applyPlace,
  canManageChildren,
  canMoveOrDelete,
  pathLabel,
  projectDrop,
  siblingOrder,
  treeOrder,
  type GroupDTO,
} from "./groups";

// Root → Music → Band → Vocals, Root → Broadcast. In the order of the siblings, not of the tree.
const groups: GroupDTO[] = [
  { id: "band", name: "Band", parentId: "music", isRoot: false },
  { id: "root", name: "Everyone", parentId: null, isRoot: true },
  { id: "music", name: "Music", parentId: "root", isRoot: false },
  { id: "broadcast", name: "Broadcast", parentId: "root", isRoot: false },
  { id: "vocals", name: "Vocals", parentId: "band", isRoot: false },
];

describe("treeOrder", () => {
  it("puts each group before the groups below it, with depths and paths without the root group", () => {
    const tree = treeOrder(groups);
    expect(tree.map((group) => [group.id, group.depth])).toEqual([
      ["root", 0],
      ["music", 1],
      ["band", 2],
      ["vocals", 3],
      ["broadcast", 1],
    ]);
    expect(pathLabel(tree[3]!)).toBe("Music › Band › Vocals");
    expect(pathLabel(tree[0]!)).toBe("Everyone");
  });

  it("treats a group whose parent is missing as a group at the top", () => {
    const tree = treeOrder(groups.filter((group) => group.id !== "music"));
    expect(tree.map((group) => group.id)).toEqual(["band", "vocals", "root", "broadcast"]);
  });
});

describe("rights", () => {
  const led = new Set(["band", "vocals"]);

  it("lets a leader manage the groups below a led group, never above the root group", () => {
    expect(canManageChildren(led, "band")).toBe(true);
    expect(canManageChildren(led, "music")).toBe(false);
    expect(canManageChildren("all", null)).toBe(false);
    expect(canManageChildren("all", "root")).toBe(true);
  });

  it("lets nobody move the root group, and a leader not the top of their branch", () => {
    expect(canMoveOrDelete("all", { parentId: null })).toBe(false);
    expect(canMoveOrDelete(led, { parentId: "music" })).toBe(false);
    expect(canMoveOrDelete(led, { parentId: "band" })).toBe(true);
  });
});

describe("projectDrop", () => {
  // The rows while Broadcast is dragged: Root, Music, Band, Vocals.
  const rows = treeOrder(groups).filter((group) => group.id !== "broadcast");

  it("keeps the wanted depth between the depths of the neighbours", () => {
    // After Vocals: from depth 1 (under Root) to depth 4 (under Vocals).
    expect(projectDrop(rows, 4, 9)).toEqual({ depth: 4, parentId: "vocals", afterId: null });
    expect(projectDrop(rows, 4, 1)).toEqual({ depth: 1, parentId: "root", afterId: "music" });
    expect(projectDrop(rows, 4, 2)).toEqual({ depth: 2, parentId: "music", afterId: "band" });
  });

  it("goes first under a parent when the row above is the parent", () => {
    expect(projectDrop(rows, 2, 2)).toEqual({ depth: 2, parentId: "music", afterId: null });
  });

  it("gives the place above the root group, which no right allows", () => {
    expect(projectDrop(rows, 0, 0)).toEqual({ depth: 0, parentId: null, afterId: null });
  });

  it("keeps a place among the siblings of the first row of a leader, which their rights refuse", () => {
    // A leader sees only Band and Vocals: above Band, the place is next to Band, under Music.
    const branch = treeOrder(groups).filter(
      (group) => group.id === "band" || group.id === "vocals",
    );
    expect(projectDrop(branch, 0, 1)).toEqual({ depth: 2, parentId: "music", afterId: null });
    expect(canManageChildren(new Set(["band", "vocals"]), "music")).toBe(false);
  });

  it("is null when no parent fits", () => {
    // Two branches of a leader: Root at depth 0 and Vocals at depth 3. Depth 2 after Vocals has no parent on the screen.
    const branches = treeOrder(groups).filter(
      (group) => group.id === "root" || group.id === "vocals",
    );
    expect(projectDrop(branches, 2, 2)).toBeNull();
  });
});

describe("siblingOrder and applyPlace", () => {
  it("puts the group after the sibling, or first", () => {
    expect(siblingOrder(groups, "vocals", "root", "music")).toEqual([
      "music",
      "vocals",
      "broadcast",
    ]);
    expect(siblingOrder(groups, "broadcast", "root", null)).toEqual(["broadcast", "music"]);
  });

  it("moves the group with the groups below it, with new depths and paths", () => {
    const tree = treeOrder(groups);
    const moved = applyPlace(tree, "band", "root", ["band", "music", "broadcast"]);
    expect(moved.map((group) => [group.id, group.depth, pathLabel(group)])).toEqual([
      ["root", 0, "Everyone"],
      ["band", 1, "Band"],
      ["vocals", 2, "Band › Vocals"],
      ["music", 1, "Music"],
      ["broadcast", 1, "Broadcast"],
    ]);
  });
});
