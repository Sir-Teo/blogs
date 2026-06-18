(function (global) {
  "use strict";

  var N = 4;
  var BOX = 2;
  var DIGITS = [1, 2, 3, 4];
  var TRACE_LIMIT = 260;

  var COLORS = {
    text: "#172026",
    muted: "#5d6872",
    rule: "#d7dee5",
    panel: "#f8fafc",
    white: "#ffffff",
    cell: "#2563eb",
    row: "#0f766e",
    col: "#b45309",
    box: "#7c3aed",
    warn: "#be123c",
    chosen: "#0f766e",
    try: "#b45309",
    paleCell: "rgba(37, 99, 235, 0.11)",
    paleChosen: "rgba(15, 118, 110, 0.14)",
    paleTry: "rgba(180, 83, 9, 0.14)",
    paleWarn: "rgba(190, 18, 60, 0.12)"
  };

  var PUZZLES = {
    six: {
      label: "six clues",
      grid: "1..4.4....4.4..1"
    },
    diagonal: {
      label: "diagonal clues",
      grid: "1...34....43...1"
    },
    thin: {
      label: "four corners",
      grid: "1..4........4..1"
    },
    blank: {
      label: "blank grid",
      grid: "................"
    },
    conflict: {
      label: "conflicting clues",
      grid: "11.............."
    }
  };

  var DEFAULTS = {
    puzzle: "six",
    heuristic: "min",
    step: 0
  };

  var HEURISTICS = {
    min: "smallest column",
    first: "leftmost column"
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function pad2(value) {
    return value < 10 ? "0" + value : String(value);
  }

  function normalize(raw) {
    raw = raw || {};
    var puzzle = PUZZLES[raw.puzzle] ? raw.puzzle : DEFAULTS.puzzle;
    var heuristic = HEURISTICS[raw.heuristic] ? raw.heuristic : DEFAULTS.heuristic;
    return {
      puzzle: puzzle,
      heuristic: heuristic,
      step: Math.round(clamp(finite(Number(raw.step), DEFAULTS.step), 0, 10000))
    };
  }

  function boxIndex(r, c) {
    return Math.floor(r / BOX) * BOX + Math.floor(c / BOX);
  }

  function cellColumn(r, c) {
    return r * N + c;
  }

  function rowDigitColumn(r, d) {
    return 16 + r * N + (d - 1);
  }

  function colDigitColumn(c, d) {
    return 32 + c * N + (d - 1);
  }

  function boxDigitColumn(r, c, d) {
    return 48 + boxIndex(r, c) * N + (d - 1);
  }

  function columnColor(type) {
    if (type === "cell") return COLORS.cell;
    if (type === "row") return COLORS.row;
    if (type === "col") return COLORS.col;
    return COLORS.box;
  }

  function makeColumn(id, type, name, label) {
    return {
      id: id,
      type: type,
      name: name,
      label: label
    };
  }

  function buildExactCover() {
    var columns = [];
    var rows = [];
    var rowsByColumn = [];
    var assignmentToRow = {};
    var r;
    var c;
    var d;

    for (var i = 0; i < 64; i += 1) rowsByColumn[i] = [];

    for (r = 0; r < N; r += 1) {
      for (c = 0; c < N; c += 1) {
        columns.push(makeColumn(cellColumn(r, c), "cell", "cell " + (r + 1) + "," + (c + 1), "C" + (r + 1) + (c + 1)));
      }
    }

    for (r = 0; r < N; r += 1) {
      for (d = 1; d <= N; d += 1) {
        columns.push(makeColumn(rowDigitColumn(r, d), "row", "row " + (r + 1) + " has " + d, "R" + (r + 1) + "=" + d));
      }
    }

    for (c = 0; c < N; c += 1) {
      for (d = 1; d <= N; d += 1) {
        columns.push(makeColumn(colDigitColumn(c, d), "col", "column " + (c + 1) + " has " + d, "K" + (c + 1) + "=" + d));
      }
    }

    for (var b = 0; b < N; b += 1) {
      for (d = 1; d <= N; d += 1) {
        columns.push(makeColumn(48 + b * N + (d - 1), "box", "box " + (b + 1) + " has " + d, "B" + (b + 1) + "=" + d));
      }
    }

    for (r = 0; r < N; r += 1) {
      for (c = 0; c < N; c += 1) {
        for (d = 1; d <= N; d += 1) {
          var colIds = [
            cellColumn(r, c),
            rowDigitColumn(r, d),
            colDigitColumn(c, d),
            boxDigitColumn(r, c, d)
          ];
          var row = {
            id: rows.length,
            r: r,
            c: c,
            d: d,
            name: "r" + (r + 1) + "c" + (c + 1) + "=" + d,
            cols: colIds
          };
          rows.push(row);
          assignmentToRow[r + ":" + c + ":" + d] = row.id;
          colIds.forEach(function (col) {
            rowsByColumn[col].push(row.id);
          });
        }
      }
    }

    return {
      columns: columns,
      rows: rows,
      rowsByColumn: rowsByColumn,
      assignmentToRow: assignmentToRow
    };
  }

  function parsePuzzle(grid) {
    var text = String(grid || "").replace(/\s+/g, "");
    var givens = [];
    var invalid = [];

    if (text.length !== 16) {
      invalid.push("expected 16 cells, saw " + text.length);
    }

    for (var index = 0; index < Math.min(text.length, 16); index += 1) {
      var ch = text.charAt(index);
      var r = Math.floor(index / N);
      var c = index % N;
      if (ch === "." || ch === "0" || ch === "_") continue;
      if (ch >= "1" && ch <= "4") {
        givens.push({ r: r, c: c, d: Number(ch), index: index });
      } else {
        invalid.push("cell " + (index + 1) + " is not a 1-4 digit or dot");
      }
    }

    return {
      text: text,
      givens: givens,
      invalid: invalid
    };
  }

  function initialState(matrix) {
    return {
      columns: matrix.columns.map(function (col) { return col.id; }),
      rows: matrix.rows.map(function (row) { return row.id; })
    };
  }

  function makeSet(values) {
    var set = {};
    values.forEach(function (value) {
      set[value] = true;
    });
    return set;
  }

  function rowTouches(matrix, rowId, colSet) {
    var cols = matrix.rows[rowId].cols;
    for (var i = 0; i < cols.length; i += 1) {
      if (colSet[cols[i]]) return true;
    }
    return false;
  }

  function columnSize(matrix, state, columnId) {
    var activeRows = makeSet(state.rows);
    var count = 0;
    matrix.rowsByColumn[columnId].forEach(function (rowId) {
      if (activeRows[rowId]) count += 1;
    });
    return count;
  }

  function rowsForColumn(matrix, state, columnId) {
    var activeRows = makeSet(state.rows);
    return matrix.rowsByColumn[columnId].filter(function (rowId) {
      return activeRows[rowId];
    });
  }

  function chooseColumn(matrix, state, heuristic) {
    if (state.columns.length === 0) return null;
    var best = state.columns[0];
    var bestSize = columnSize(matrix, state, best);

    if (heuristic === "first") {
      return { column: best, size: bestSize };
    }

    for (var i = 1; i < state.columns.length; i += 1) {
      var col = state.columns[i];
      var size = columnSize(matrix, state, col);
      if (size < bestSize) {
        best = col;
        bestSize = size;
        if (bestSize === 0) break;
      }
    }

    return { column: best, size: bestSize };
  }

  function coverRow(matrix, state, rowId) {
    var row = matrix.rows[rowId];
    var coveredSet = makeSet(row.cols);
    var removedRows = [];
    var nextRows = [];
    var activeColumns = makeSet(state.columns);
    var missingColumns = [];

    row.cols.forEach(function (col) {
      if (!activeColumns[col]) missingColumns.push(col);
    });

    state.rows.forEach(function (activeRow) {
      if (rowTouches(matrix, activeRow, coveredSet)) {
        removedRows.push(activeRow);
      } else {
        nextRows.push(activeRow);
      }
    });

    return {
      state: {
        columns: state.columns.filter(function (col) { return !coveredSet[col]; }),
        rows: nextRows
      },
      coveredColumns: row.cols.slice(),
      removedRows: removedRows,
      missingColumns: missingColumns
    };
  }

  function snapshot(matrix, state) {
    var sizes = [];
    var active = {};
    state.columns.forEach(function (col) {
      active[col] = true;
      sizes[col] = columnSize(matrix, state, col);
    });
    return {
      columns: state.columns.slice(),
      active: active,
      sizes: sizes,
      rowCount: state.rows.length
    };
  }

  function solutionGrid(matrix, rowIds) {
    var grid = new Array(16);
    rowIds.forEach(function (rowId) {
      var row = matrix.rows[rowId];
      grid[row.r * N + row.c] = row.d;
    });
    return grid;
  }

  function gridToRows(grid) {
    var lines = [];
    for (var r = 0; r < N; r += 1) {
      var line = [];
      for (var c = 0; c < N; c += 1) {
        var value = grid[r * N + c];
        line.push(value ? String(value) : ".");
      }
      lines.push(line.join(" "));
    }
    return lines;
  }

  function gridString(grid) {
    return grid.map(function (value) {
      return value ? String(value) : ".";
    }).join("");
  }

  function solveExactCover(raw, options) {
    options = options || {};
    var params = normalize(raw);
    var puzzle = PUZZLES[params.puzzle];
    var matrix = buildExactCover();
    var parsed = parsePuzzle(puzzle.grid);
    var state = initialState(matrix);
    var givens = [];
    var trace = [];
    var traceLimit = options.traceLimit || TRACE_LIMIT;
    var maxSolutions = options.maxSolutions || 1000;
    var contradiction = parsed.invalid.length ? parsed.invalid[0] : null;
    var stats = {
      nodes: 0,
      branches: 0,
      deadEnds: 0,
      backtracks: 0,
      maxDepth: 0,
      covers: 0,
      removedRows: 0,
      coveredColumns: 0
    };

    function push(event, eventState) {
      if (trace.length >= traceLimit) return;
      event.index = trace.length;
      event.snapshot = snapshot(matrix, eventState);
      trace.push(event);
    }

    parsed.givens.forEach(function (given) {
      if (contradiction) return;
      var rowId = matrix.assignmentToRow[given.r + ":" + given.c + ":" + given.d];
      var activeRows = makeSet(state.rows);
      if (!activeRows[rowId]) {
        contradiction = "clue r" + (given.r + 1) + "c" + (given.c + 1) + "=" + given.d + " conflicts with an earlier clue";
        push({ type: "contradiction", depth: givens.length, row: rowId, message: contradiction }, state);
        return;
      }
      var covered = coverRow(matrix, state, rowId);
      state = covered.state;
      givens.push(rowId);
      stats.covers += 1;
      stats.removedRows += covered.removedRows.length;
      stats.coveredColumns += covered.coveredColumns.length;
      push({
        type: "given",
        depth: givens.length,
        row: rowId,
        removedRows: covered.removedRows.length,
        coveredColumns: covered.coveredColumns.slice()
      }, state);
    });

    var solutions = [];

    function search(searchState, partial, depth) {
      if (solutions.length >= maxSolutions) return;
      stats.nodes += 1;
      stats.maxDepth = Math.max(stats.maxDepth, depth);

      if (searchState.columns.length === 0) {
        var solvedRows = givens.concat(partial);
        solutions.push(solvedRows.slice());
        push({ type: "solution", depth: depth, rows: solvedRows.slice() }, searchState);
        return;
      }

      var choice = chooseColumn(matrix, searchState, params.heuristic);
      var candidates = choice ? rowsForColumn(matrix, searchState, choice.column) : [];
      push({
        type: "choose",
        depth: depth,
        column: choice ? choice.column : null,
        size: choice ? choice.size : 0,
        candidates: candidates.slice()
      }, searchState);

      if (!choice || candidates.length === 0) {
        stats.deadEnds += 1;
        stats.backtracks += 1;
        push({ type: "dead", depth: depth, column: choice ? choice.column : null }, searchState);
        return;
      }

      for (var i = 0; i < candidates.length; i += 1) {
        var rowId = candidates[i];
        stats.branches += 1;
        push({ type: "try", depth: depth, row: rowId, column: choice.column }, searchState);
        var covered = coverRow(matrix, searchState, rowId);
        stats.covers += 1;
        stats.removedRows += covered.removedRows.length;
        stats.coveredColumns += covered.coveredColumns.length;
        search(covered.state, partial.concat(rowId), depth + 1);
        if (solutions.length >= maxSolutions) return;
      }

      stats.backtracks += 1;
    }

    if (!contradiction) search(state, [], 0);

    var grids = solutions.map(function (rows) {
      return solutionGrid(matrix, rows);
    });

    return {
      params: params,
      puzzle: puzzle,
      matrix: matrix,
      parsed: parsed,
      contradiction: contradiction,
      givens: givens,
      solutions: solutions,
      grids: grids,
      trace: trace,
      stats: stats
    };
  }

  function validGroup(values) {
    var seen = {};
    for (var i = 0; i < values.length; i += 1) {
      var value = values[i];
      if (value < 1 || value > 4 || seen[value]) return false;
      seen[value] = true;
    }
    return true;
  }

  function isValidSudokuGrid(grid) {
    if (!grid || grid.length !== 16) return false;
    var r;
    var c;
    for (r = 0; r < N; r += 1) {
      var row = [];
      for (c = 0; c < N; c += 1) row.push(grid[r * N + c]);
      if (!validGroup(row)) return false;
    }
    for (c = 0; c < N; c += 1) {
      var col = [];
      for (r = 0; r < N; r += 1) col.push(grid[r * N + c]);
      if (!validGroup(col)) return false;
    }
    for (var br = 0; br < N; br += BOX) {
      for (var bc = 0; bc < N; bc += BOX) {
        var box = [];
        for (r = br; r < br + BOX; r += 1) {
          for (c = bc; c < bc + BOX; c += 1) box.push(grid[r * N + c]);
        }
        if (!validGroup(box)) return false;
      }
    }
    return true;
  }

  function respectsGivens(grid, parsed) {
    for (var i = 0; i < parsed.givens.length; i += 1) {
      var given = parsed.givens[i];
      if (grid[given.index] !== given.d) return false;
    }
    return true;
  }

  function bruteSudoku(gridText, limit) {
    limit = limit || 1000;
    var parsed = parsePuzzle(gridText);
    var grid = new Array(16);
    var invalid = parsed.invalid.slice();
    var solutions = [];

    for (var i = 0; i < 16; i += 1) grid[i] = 0;
    parsed.givens.forEach(function (given) {
      grid[given.index] = given.d;
    });

    function allowed(index, d) {
      var r = Math.floor(index / N);
      var c = index % N;
      var i;
      for (i = 0; i < N; i += 1) {
        if (i !== c && grid[r * N + i] === d) return false;
        if (i !== r && grid[i * N + c] === d) return false;
      }
      var br = Math.floor(r / BOX) * BOX;
      var bc = Math.floor(c / BOX) * BOX;
      for (var rr = br; rr < br + BOX; rr += 1) {
        for (var cc = bc; cc < bc + BOX; cc += 1) {
          var other = rr * N + cc;
          if (other !== index && grid[other] === d) return false;
        }
      }
      return true;
    }

    parsed.givens.forEach(function (given) {
      if (!allowed(given.index, given.d)) {
        invalid.push("clue r" + (given.r + 1) + "c" + (given.c + 1) + "=" + given.d + " conflicts with another clue");
      }
    });

    function nextEmpty() {
      var best = -1;
      var bestOptions = 10;
      for (var index = 0; index < 16; index += 1) {
        if (grid[index]) continue;
        var options = 0;
        for (var d = 1; d <= N; d += 1) {
          if (allowed(index, d)) options += 1;
        }
        if (options < bestOptions) {
          best = index;
          bestOptions = options;
          if (options === 0) break;
        }
      }
      return best;
    }

    function search() {
      if (solutions.length >= limit) return;
      var index = nextEmpty();
      if (index < 0) {
        solutions.push(grid.slice());
        return;
      }
      for (var d = 1; d <= N; d += 1) {
        if (!allowed(index, d)) continue;
        grid[index] = d;
        search();
        grid[index] = 0;
      }
    }

    if (invalid.length === 0) search();

    return {
      parsed: parsed,
      invalid: invalid,
      solutions: solutions
    };
  }

  function coversEveryColumnOnce(matrix, solutionRows) {
    var counts = [];
    for (var i = 0; i < matrix.columns.length; i += 1) counts[i] = 0;
    solutionRows.forEach(function (rowId) {
      matrix.rows[rowId].cols.forEach(function (col) {
        counts[col] += 1;
      });
    });
    return counts.every(function (count) { return count === 1; });
  }

  function auditExactCover() {
    var matrix = buildExactCover();
    var issues = [];
    var reports = [];

    if (matrix.rows.length !== 64) issues.push("expected 64 assignment rows");
    if (matrix.columns.length !== 64) issues.push("expected 64 constraint columns");

    matrix.rows.forEach(function (row) {
      var seen = {};
      row.cols.forEach(function (col) { seen[col] = true; });
      if (Object.keys(seen).length !== 4) issues.push(row.name + " does not cover four unique constraints");
    });

    Object.keys(PUZZLES).forEach(function (key) {
      var puzzle = PUZZLES[key];
      var exact = solveExactCover({ puzzle: key, heuristic: "min" }, { maxSolutions: 1000, traceLimit: 16 });
      var exactFirst = solveExactCover({ puzzle: key, heuristic: "first" }, { maxSolutions: 1000, traceLimit: 16 });
      var brute = bruteSudoku(puzzle.grid, 1000);
      var bruteCount = brute.solutions.length;
      var exactCount = exact.solutions.length;

      if (exactCount !== bruteCount) {
        issues.push(key + " exact-cover count " + exactCount + " != brute count " + bruteCount);
      }

      exact.solutions.forEach(function (solution, index) {
        var grid = exact.grids[index];
        if (!coversEveryColumnOnce(matrix, solution)) issues.push(key + " solution " + index + " misses exact cover");
        if (!isValidSudokuGrid(grid)) issues.push(key + " solution " + index + " is not a valid grid");
        if (!respectsGivens(grid, exact.parsed)) issues.push(key + " solution " + index + " violates givens");
      });

      reports.push({
        puzzle: key,
        label: puzzle.label,
        exactSolutions: exactCount,
        bruteSolutions: bruteCount,
        minNodes: exact.stats.nodes,
        firstNodes: exactFirst.stats.nodes,
        contradiction: exact.contradiction || null
      });
    });

    return {
      ok: issues.length === 0,
      issues: issues,
      reports: reports
    };
  }

  function eventLabel(result, event) {
    if (!event) return "no trace";
    var matrix = result.matrix;
    if (event.type === "given") return "given " + matrix.rows[event.row].name;
    if (event.type === "choose") return "choose " + matrix.columns[event.column].label + " (" + event.size + " rows)";
    if (event.type === "try") return "try " + matrix.rows[event.row].name;
    if (event.type === "dead") return "dead end";
    if (event.type === "solution") return "solution";
    if (event.type === "contradiction") return "contradiction";
    return event.type;
  }

  function setText(root, name, value) {
    var node = root.querySelector('[data-metric="' + name + '"]');
    if (node) node.textContent = value;
  }

  function setCanvasSize(canvas, width, height) {
    var ratio = global.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = "100%";
    canvas.style.height = "auto";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return ctx;
  }

  function fillText(ctx, text, x, y, size, color, weight) {
    ctx.fillStyle = color || COLORS.text;
    ctx.font = (weight || 500) + " " + size + "px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillText(String(text), x, y);
  }

  function drawPanel(ctx, x, y, w, h, title) {
    ctx.fillStyle = COLORS.white;
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    fillText(ctx, title, x + 14, y + 25, 14, COLORS.text, 750);
  }

  function drawSudoku(ctx, result, event, x, y, size) {
    var matrix = result.matrix;
    var parsed = result.parsed;
    var solution = result.grids[0] || new Array(16);
    var givens = {};
    var focus = event && typeof event.row === "number" ? matrix.rows[event.row] : null;
    parsed.givens.forEach(function (given) {
      givens[given.index] = true;
    });

    drawPanel(ctx, x, y, size, size + 56, "4x4 Sudoku instance");
    var gridX = x + 22;
    var gridY = y + 46;
    var gridSize = size - 44;
    var cell = gridSize / N;

    for (var r = 0; r < N; r += 1) {
      for (var c = 0; c < N; c += 1) {
        var index = r * N + c;
        var isGiven = givens[index];
        var isFocus = focus && focus.r === r && focus.c === c;
        ctx.fillStyle = isFocus ? COLORS.paleTry : isGiven ? COLORS.paleCell : COLORS.white;
        ctx.fillRect(gridX + c * cell, gridY + r * cell, cell, cell);
        ctx.strokeStyle = COLORS.rule;
        ctx.strokeRect(gridX + c * cell, gridY + r * cell, cell, cell);
        var value = isGiven ? parsed.text.charAt(index) : solution[index];
        if (value) {
          fillText(ctx, value, gridX + c * cell + cell * 0.39, gridY + r * cell + cell * 0.64, 30, isGiven ? COLORS.cell : COLORS.text, isGiven ? 850 : 650);
        }
      }
    }

    ctx.strokeStyle = COLORS.text;
    ctx.lineWidth = 2;
    for (var line = 0; line <= N; line += 2) {
      ctx.beginPath();
      ctx.moveTo(gridX + line * cell, gridY);
      ctx.lineTo(gridX + line * cell, gridY + gridSize);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(gridX, gridY + line * cell);
      ctx.lineTo(gridX + gridSize, gridY + line * cell);
      ctx.stroke();
    }
    ctx.lineWidth = 1;

    var footer = result.contradiction ? result.contradiction : result.grids[0] ? gridToRows(result.grids[0]).join(" / ") : "no solution";
    fillText(ctx, footer, x + 14, y + size + 38, 12, result.contradiction ? COLORS.warn : COLORS.muted, 600);
  }

  function drawColumnBars(ctx, result, event, x, y, w, h) {
    var matrix = result.matrix;
    var snap = event && event.snapshot ? event.snapshot : snapshot(matrix, initialState(matrix));
    drawPanel(ctx, x, y, w, h, "constraint columns");
    var graphX = x + 18;
    var graphY = y + 54;
    var graphW = w - 36;
    var graphH = h - 86;
    var barGap = 2;
    var barW = (graphW - barGap * 63) / 64;
    var maxSize = 4;
    var labels = [
      { text: "cell", x: 0, color: COLORS.cell },
      { text: "row digit", x: 16, color: COLORS.row },
      { text: "column digit", x: 32, color: COLORS.col },
      { text: "box digit", x: 48, color: COLORS.box }
    ];

    ctx.strokeStyle = COLORS.rule;
    ctx.beginPath();
    ctx.moveTo(graphX, graphY + graphH);
    ctx.lineTo(graphX + graphW, graphY + graphH);
    ctx.stroke();

    matrix.columns.forEach(function (column, index) {
      var active = snap.active[column.id];
      var size = active ? snap.sizes[column.id] : 0;
      var barH = active ? Math.max(2, graphH * size / maxSize) : 1;
      var bx = graphX + index * (barW + barGap);
      var by = graphY + graphH - barH;
      ctx.fillStyle = active ? columnColor(column.type) : "#e6ebf0";
      ctx.globalAlpha = active ? 0.86 : 0.72;
      ctx.fillRect(bx, by, barW, barH);
      ctx.globalAlpha = 1;
      if (event && event.column === column.id) {
        ctx.strokeStyle = COLORS.warn;
        ctx.lineWidth = 2;
        ctx.strokeRect(bx - 1, graphY - 4, barW + 2, graphH + 6);
        ctx.lineWidth = 1;
      }
    });

    labels.forEach(function (label) {
      var lx = graphX + label.x * (barW + barGap);
      ctx.fillStyle = label.color;
      ctx.fillRect(lx, y + h - 23, 16, 4);
      fillText(ctx, label.text, lx + 20, y + h - 17, 11, COLORS.muted, 650);
    });

    var status = snap.columns.length + " active columns, " + snap.rowCount + " active rows";
    fillText(ctx, status, x + w - 220, y + 26, 12, COLORS.muted, 650);
  }

  function drawEventDetails(ctx, result, event, x, y, w, h) {
    var matrix = result.matrix;
    drawPanel(ctx, x, y, w, h, "current trace event");
    fillText(ctx, eventLabel(result, event), x + 16, y + 54, 22, event && event.type === "dead" ? COLORS.warn : COLORS.text, 800);
    fillText(ctx, "heuristic: " + HEURISTICS[result.params.heuristic], x + 16, y + 82, 13, COLORS.muted, 650);

    if (event && typeof event.column === "number") {
      var column = matrix.columns[event.column];
      ctx.fillStyle = columnColor(column.type);
      ctx.fillRect(x + 16, y + 106, 18, 18);
      fillText(ctx, column.label + "  " + column.name, x + 44, y + 121, 13, COLORS.text, 700);
    }

    if (event && typeof event.row === "number") {
      var row = matrix.rows[event.row];
      fillText(ctx, row.name + " covers:", x + 16, y + 152, 13, COLORS.text, 750);
      row.cols.forEach(function (col, i) {
        var column = matrix.columns[col];
        var cx = x + 16 + (i % 2) * 150;
        var cy = y + 174 + Math.floor(i / 2) * 31;
        ctx.fillStyle = columnColor(column.type);
        ctx.globalAlpha = 0.12;
        ctx.fillRect(cx, cy, 134, 23);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = columnColor(column.type);
        ctx.strokeRect(cx, cy, 134, 23);
        fillText(ctx, column.label, cx + 8, cy + 16, 12, COLORS.text, 750);
      });
    }

    if (event && event.type === "solution" && result.grids[0]) {
      fillText(ctx, "solution string: " + gridString(result.grids[0]), x + 16, y + h - 24, 13, COLORS.chosen, 750);
    } else if (result.contradiction) {
      fillText(ctx, result.contradiction, x + 16, y + h - 24, 13, COLORS.warn, 750);
    }
  }

  function drawTraceList(ctx, result, step, x, y, w, h) {
    drawPanel(ctx, x, y, w, h, "search ledger");
    var start = clamp(step - 5, 0, Math.max(0, result.trace.length - 10));
    for (var i = 0; i < 10; i += 1) {
      var index = start + i;
      var event = result.trace[index];
      if (!event) break;
      var yy = y + 52 + i * 24;
      if (index === step) {
        ctx.fillStyle = COLORS.paleChosen;
        ctx.fillRect(x + 10, yy - 16, w - 20, 21);
      }
      fillText(ctx, pad2(index), x + 18, yy, 12, index === step ? COLORS.chosen : COLORS.muted, 750);
      fillText(ctx, eventLabel(result, event), x + 54, yy, 12, COLORS.text, 650);
    }
  }

  function draw(canvas, result, step) {
    var width = 1120;
    var height = 690;
    var ctx = setCanvasSize(canvas, width, height);
    var event = result.trace[step] || result.trace[result.trace.length - 1] || null;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(0, 0, width, height);
    drawSudoku(ctx, result, event, 24, 24, 330);
    drawColumnBars(ctx, result, event, 384, 24, 712, 230);
    drawEventDetails(ctx, result, event, 384, 280, 350, 386);
    drawTraceList(ctx, result, step, 758, 280, 338, 386);
  }

  function updateOutputs(root, params, result, step) {
    root.querySelectorAll("output[data-value]").forEach(function (output) {
      var name = output.getAttribute("data-value");
      if (name === "puzzle") output.textContent = PUZZLES[params.puzzle].label;
      if (name === "heuristic") output.textContent = HEURISTICS[params.heuristic];
      if (name === "step") output.textContent = result.trace.length ? step + " / " + (result.trace.length - 1) : "0 / 0";
    });

    setText(root, "columns", result.matrix.columns.length);
    setText(root, "rows", result.matrix.rows.length);
    setText(root, "givens", result.parsed.givens.length);
    setText(root, "solutions", result.solutions.length);
    setText(root, "nodes", result.stats.nodes);
    setText(root, "dead", result.stats.deadEnds);
    setText(root, "removed", result.stats.removedRows);
    setText(root, "audit", result.contradiction ? "conflict" : (result.grids[0] && isValidSudokuGrid(result.grids[0]) ? "valid" : result.solutions.length ? "check" : "none"));
  }

  function mount(root) {
    var controls = root.querySelectorAll("[data-param]");
    var state = normalize({});
    var canvas = root.querySelector("canvas");

    controls.forEach(function (control) {
      var name = control.getAttribute("data-param");
      if (name === "puzzle") control.value = state.puzzle;
      if (name === "heuristic") control.value = state.heuristic;
      if (name === "step") control.value = state.step;
      control.addEventListener("input", function () {
        state[name] = control.value;
        render();
      });
      control.addEventListener("change", function () {
        state[name] = control.value;
        render();
      });
    });

    function render() {
      var params = normalize(state);
      var result = solveExactCover(params, { maxSolutions: 1000 });
      var maxStep = Math.max(0, result.trace.length - 1);
      var step = clamp(Math.round(finite(Number(params.step), 0)), 0, maxStep);
      state.step = step;
      controls.forEach(function (control) {
        var name = control.getAttribute("data-param");
        if (name === "step") {
          control.max = maxStep;
          control.value = step;
        } else {
          control.value = params[name];
        }
      });
      updateOutputs(root, params, result, step);
      if (canvas) draw(canvas, result, step);
    }

    render();
  }

  function mountAll() {
    if (!global.document) return;
    var roots = global.document.querySelectorAll("[data-exact-cover-lab]");
    roots.forEach(function (root) {
      mount(root);
    });
  }

  var api = {
    buildExactCover: buildExactCover,
    solveExactCover: solveExactCover,
    bruteSudoku: bruteSudoku,
    auditExactCover: auditExactCover,
    isValidSudokuGrid: isValidSudokuGrid,
    gridString: gridString,
    gridToRows: gridToRows,
    PUZZLES: PUZZLES
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    global.ExactCoverLab = api;
    if (global.document) {
      if (global.document.readyState === "loading") {
        global.document.addEventListener("DOMContentLoaded", mountAll);
      } else {
        mountAll();
      }
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
