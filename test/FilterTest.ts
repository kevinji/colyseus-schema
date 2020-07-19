import * as assert from "assert";
import { Schema, type, filter, ArraySchema, MapSchema, Reflection, DataChange } from "../src";
import { Client, filterChildren } from "../src/annotations";
import { nanoid } from "nanoid";


describe("@filter Test", () => {

    it("should filter property outside root", () => {
        class Player extends Schema {
            @filter(function(this: Player, client: Client, value, root: State) {
                return (
                    (root.playerOne === this && client.sessionId === "one") ||
                    (root.playerTwo === this && client.sessionId === "two")
                );
            })
            @type("string") name: string;
        }

        class State extends Schema {
            @type(Player) playerOne: Player;
            @type(Player) playerTwo: Player;
        }

        const state = new State();
        state.playerOne = new Player();
        state.playerOne.name = "Jake";

        state.playerTwo = new Player();
        state.playerTwo.name = "Katarina";

        const encoded = state.encode(undefined, undefined, true);

        const full = new State();
        full.decode(encoded);

        const client1 = { sessionId: "one" };
        const client2 = { sessionId: "two" };

        const filtered1 = state.applyFilters(encoded, client1);
        const decoded1 = new State();
        decoded1.decode(filtered1);

        const filtered2 = state.applyFilters(encoded, client2);
        const decoded2 = new State();
        decoded2.decode(filtered2);

        assert.equal("Jake", decoded1.playerOne.name);
        assert.equal(undefined, decoded1.playerTwo.name);

        assert.equal(undefined, decoded2.playerOne.name);
        assert.equal("Katarina", decoded2.playerTwo.name);
    });

    it("should filter direct properties on root state", () => {
        class State extends Schema {
            @type("string") str: string;

            @filter(function(this: State, client: Client, value, root) {
                return client.sessionId === "two";
            })
            @type("number") num: number;
        }

        const state = new State();
        state.str = "hello";
        state.num = 1;

        const encoded = state.encode(undefined, undefined, true);

        const full = new State();
        full.decode(encoded);

        const client1 = { sessionId: "one" };
        const client2 = { sessionId: "two" };

        const decoded1 = new State()
        decoded1.decode(state.applyFilters(encoded, client1));

        const decoded2 = new State()
        decoded2.decode(state.applyFilters(encoded, client2));

        assert.equal("hello", decoded1.str);
        assert.equal("hello", decoded2.str);

        assert.equal(undefined, decoded1.num);
        assert.equal(1, decoded2.num);
    });

    it("should filter array items", () => {
        class Player extends Schema {
            @type("string") name: string;
        }

        class State extends Schema {
            @filterChildren(function(this: Player, client: Client, key, value: Player, root: State) {
                return (value.name === client.sessionId);
            })
            @type([Player]) players = new ArraySchema<Player>();
        }

        const state = new State();
        state.players.push(new Player({ name: "one" }));
        state.players.push(new Player({ name: "two" }));
        state.players.push(new Player({ name: "three" }));

        const encoded = state.encode(undefined, undefined, true);

        const full = new State();
        full.decode(encoded);

        const client1 = { sessionId: "one" };
        const client2 = { sessionId: "two" };

        const filtered1 = state.applyFilters(encoded, client1);
        const decoded1 = new State()
        decoded1.decode(filtered1);

        const filtered2 = state.applyFilters(encoded, client2);
        const decoded2 = new State();
        decoded2.decode(filtered2);

        assert.equal("one", decoded1.players[0].name);
        assert.equal(1, decoded1.players.length);

        assert.equal("two", decoded2.players[0].name);
        assert.equal(1, decoded2.players.length);
    });

    it("should filter map items by distance", () => {
        class Entity extends Schema {
            @type("number") x: number;
            @type("number") y: number;
        }

        class Player extends Entity {
            @type("number") radius: number;
        }

        class State extends Schema {
            @filterChildren(function (client, key: string, value: Entity, root: State) {
                const currentPlayer = root.entities.get(client.sessionId);
                if (currentPlayer) {
                    const a = value.x - currentPlayer.x;
                    const b = value.y - currentPlayer.y;

                    return (Math.sqrt(a * a + b * b)) <= 10;

                } else {
                    return false;
                }

            })
            @type({ map: Entity }) entities = new MapSchema<Entity>();
        }

        const state = new State();
        state.entities.set(nanoid(), new Entity().assign({ x: 5, y: 5 }));
        state.entities.set(nanoid(), new Entity().assign({ x: 8, y: 8 }));
        state.entities.set(nanoid(), new Entity().assign({ x: 16, y: 16 }));
        state.entities.set(nanoid(), new Entity().assign({ x: 20, y: 20 }));

        state.encode(undefined, undefined, true);
        state.discardAllChanges();

        console.log("\n\nENCODE ALL!");
        let fullBytes = state.encodeAll(true);

        const client = { sessionId: "player" };

        const decodedState = new State();
        decodedState.entities.onAdd = (entity, key) => console.log("Entity added =>", key, entity.toJSON());
        decodedState.entities.onRemove = (entity, key) => console.log("Entity removed =>", key, entity.toJSON());

        let filteredFullBytes = state.applyFilters(fullBytes, client, true);
        decodedState.decode(filteredFullBytes);

        // state.entities.forEach(entity => {
        //     entity.x = entity.x + 1;
        //     console.log(`ENTITY (refId = ${entity['$changes'].refId})`, entity.toJSON());
        // });
        state.entities.set('player', new Player().assign({ x: 10, y: 10, radius: 1 }));

        let patchBytes = state.encode(undefined, undefined, true);

        console.log("\n\nAPPLY FILTERS =>");
        const filtered = state.applyFilters(patchBytes, client);

        console.log("\n\nWILL DECODE");
        decodedState.decode(filtered);

        console.log(decodedState.toJSON());

        // assert.equal(4, decodedState.entities.size);
    });


    // it("should filter property outside of root", () => {
    //     const state = new StateWithFilter();
    //     state.filteredNumber = 10;

    //     state.units.one = new Unit();
    //     state.units.one.inventory = new Inventory();
    //     state.units.one.inventory.items = 10;

    //     state.units.two = new Unit();
    //     state.units.two.inventory = new Inventory();
    //     state.units.two.inventory.items = 20;

    //     const client1 = { sessionId: "one" };
    //     const client2 = { sessionId: "two" };
    //     const client3 = { sessionId: "three" };

    //     const decoded1 = (new StateWithFilter()).decode(state.encodeFiltered(client1));
    //     state.encodeAllFiltered(client3);
    //     const decoded2 = (new StateWithFilter()).decode(state.encodeFiltered(client2));

    //     assert.equal(decoded1.units.one.inventory.items, 10);
    //     assert.equal(decoded1.units.two.inventory, undefined);
    //     assert.equal(decoded1.filteredNumber, 10);

    //     assert.equal(decoded2.units.one.inventory, undefined);
    //     assert.equal(decoded2.units.two.inventory.items, 20);
    //     assert.equal(decoded2.filteredNumber, undefined);
    // });

    // xit("should filter map entries by distance", () => {
    //     const state = new StateWithFilter();
    //     state.unitsWithDistanceFilter = new MapSchema<Unit>();

    //     const createUnit = (key: string, x: number, y: number) => {
    //         const unit = new Unit();
    //         unit.x = x;
    //         unit.y = y;
    //         state.unitsWithDistanceFilter[key] = unit;
    //     };

    //     createUnit("one", 0, 0);
    //     createUnit("two", 10, 0);
    //     createUnit("three", 15, 0);
    //     createUnit("four", 20, 0);
    //     createUnit("five", 50, 0);

    //     const client1 = { sessionId: "one" };
    //     const client2 = { sessionId: "two" };
    //     const client3 = { sessionId: "three" };
    //     const client4 = { sessionId: "four" };
    //     const client5 = { sessionId: "five" };

    //     const decoded1 = (new StateWithFilter()).decode(state.encodeFiltered(client1));
    //     const decoded2 = (new StateWithFilter()).decode(state.encodeFiltered(client2));
    //     const decoded3 = (new StateWithFilter()).decode(state.encodeFiltered(client3));
    //     const decoded4 = (new StateWithFilter()).decode(state.encodeFiltered(client4));
    //     const decoded5 = (new StateWithFilter()).decode(state.encodeFiltered(client5));

    //     assert.deepEqual(Object.keys(decoded1.unitsWithDistanceFilter), ['one', 'two']);
    //     assert.deepEqual(Object.keys(decoded2.unitsWithDistanceFilter), ['one', 'two', 'three', 'four']);
    //     assert.deepEqual(Object.keys(decoded3.unitsWithDistanceFilter), ['two', 'three', 'four']);
    //     assert.deepEqual(Object.keys(decoded4.unitsWithDistanceFilter), ['two', 'three', 'four']);
    //     assert.deepEqual(Object.keys(decoded5.unitsWithDistanceFilter), ['five']);
    // });

    // xit("should trigger onAdd when filter starts to match", () => {
    //     const state = new StateWithFilter();
    //     state.unitsWithDistanceFilter = new MapSchema<Unit>();

    //     const client5 = { sessionId: "five" };

    //     // FIRST DECODE
    //     const decoded5 = (new StateWithFilter()).decode(state.encodeFiltered(client5));
    //     assert.equal(JSON.stringify(decoded5), '{"units":{},"unitsWithDistanceFilter":{}}');

    //     const createUnit = (key: string, x: number, y: number) => {
    //         const unit = new Unit();
    //         unit.x = x;
    //         unit.y = y;
    //         state.unitsWithDistanceFilter[key] = unit;
    //     };

    //     createUnit("one", 0, 0);
    //     createUnit("two", 10, 0);
    //     createUnit("three", 15, 0);
    //     createUnit("four", 20, 0);
    //     createUnit("five", 50, 0);

    //     // SECOND DECODE
    //     decoded5.decode(state.encodeFiltered(client5));
    //     assert.equal(JSON.stringify(decoded5), '{"units":{},"unitsWithDistanceFilter":{"five":{"x":50,"y":0}}}');

    //     assert.deepEqual(Object.keys(decoded5.unitsWithDistanceFilter), ['five']);

    //     // SECOND DECODE
    //     state.unitsWithDistanceFilter.five.x = 30;
    //     decoded5.unitsWithDistanceFilter.onAdd = function(item, key) {}
    //     let onAddSpy = sinon.spy(decoded5.unitsWithDistanceFilter, 'onAdd');

    //     decoded5.decode(state.encodeFiltered(client5));
    //     assert.equal(JSON.stringify(decoded5), '{"units":{},"unitsWithDistanceFilter":{"five":{"x":30,"y":0},"four":{"x":20,"y":0}}}');

    //     assert.deepEqual(Object.keys(decoded5.unitsWithDistanceFilter), ['five', 'four']);

    //     // THIRD DECODE
    //     state.unitsWithDistanceFilter.five.x = 17;
    //     decoded5.decode(state.encodeFiltered(client5));
    //     assert.equal(JSON.stringify(decoded5), '{"units":{},"unitsWithDistanceFilter":{"five":{"x":17,"y":0},"four":{"x":20,"y":0},"two":{"x":10,"y":0},"three":{"x":15,"y":0}}}');

    //     assert.deepEqual(Object.keys(decoded5.unitsWithDistanceFilter), ['five', 'four', 'two', 'three']);
    //     sinon.assert.calledThrice(onAddSpy);
    // });

    // xit("should trigger onRemove when filter by distance doesn't match anymore", () => {
    //     const state = new StateWithFilter();
    //     state.unitsWithDistanceFilter = new MapSchema<Unit>();

    //     const createUnit = (key: string, x: number, y: number) => {
    //         const unit = new Unit();
    //         unit.x = x;
    //         unit.y = y;
    //         state.unitsWithDistanceFilter[key] = unit;
    //     };

    //     createUnit("one", 0, 0);
    //     createUnit("two", 10, 0);
    //     createUnit("three", 20, 0);

    //     const client2 = { sessionId: "two" };

    //     const decoded2 = new StateWithFilter();
    //     decoded2.unitsWithDistanceFilter.onAdd = function(unit, key) {
    //         console.log("onAdd =>", key);
    //     }
    //     decoded2.unitsWithDistanceFilter.onRemove = function(unit, key) {
    //         console.log("onRemove =>", key);
    //     }
    //     const onAddSpy = sinon.spy(decoded2.unitsWithDistanceFilter, 'onAdd');
    //     const onRemoveSpy = sinon.spy(decoded2.unitsWithDistanceFilter, 'onRemove');

    //     decoded2.decode(state.encodeFiltered(client2));

    //     state.unitsWithDistanceFilter['three'].x = 21;
    //     decoded2.decode(state.encodeFiltered(client2));

    //     sinon.assert.calledThrice(onAddSpy);
    //     // assert.deepEqual(Object.keys(decoded2.unitsWithDistanceFilter), ['one', 'two', 'three', 'four']);
    // });

    // it("should not trigger `onChange` if field haven't changed", () => {
    //     const state = new StateWithFilter();
    //     state.filteredNumber = 10;

    //     const client1 = { sessionId: "one" };

    //     const decoded1 = new StateWithFilter();
    //     decoded1.decode(state.encodeFiltered(client1));

    //     let changes: DataChange[];

    //     decoded1.onChange = (changelist) => changes = changelist;

    //     state.unfilteredString = "20";
    //     decoded1.decode(state.encodeFiltered(client1));

    //     assert.deepEqual([
    //         { field: 'unfilteredString', value: '20', previousValue: undefined }
    //     ], changes);

    //     state.filteredNumber = 11;
    //     decoded1.decode(state.encodeFiltered(client1));
    //     assert.deepEqual([
    //         { field: 'filteredNumber', value: 11, previousValue: 10 }
    //     ], changes);
    // });
});