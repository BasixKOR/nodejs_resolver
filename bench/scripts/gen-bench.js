const babel = require("@babel/core");
const path = require("path");
const fs = require("fs");
const resolver = require("enhanced-resolve");

// copy from `/ant-design/node_modules/@ant-design/tools/lib/`
const resolve = resolver.create.sync({
  extensions: [
    ".web.tsx",
    ".web.ts",
    ".web.jsx",
    ".web.js",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".json",
  ],
  fileSystem: fs,
  alias: {
    "@ant-design/tools": path.resolve(__dirname, "../ant-design"),
  },
});

/**
 *
 * @param {string} p
 */
function getDirFromAbsolutePath(p) {
  return path.dirname(p);
}

/**
 *
 * @param {string} p
 */
function getFileFromAbsolutePath(p) {
  return p.split("/").pop();
}

function isNotJsFile(file) {
  return !(
    file.endsWith(".js") ||
    file.endsWith(".ts") ||
    file.endsWith(".jsx") ||
    file.endsWith(".tsx")
  );
}

/**
 *
 * @param {string} dir
 * @param {string} file
 * @param {Set<String>} set
 * @param {(dir: string, file: string) => void} callback
 */
function dfs(dir, file, set, callback) {
  if (isNotJsFile(file)) {
    return;
  }
  const target = path.resolve(dir, file);
  if (set.has(target)) {
    // avoid self-reference,
    // such as https://github.com/ant-design/ant-design/blob/master/components/version/index.tsx
    return;
  } else {
    set.add(target);
  }

  if (set.size % 100 == 0) {
    console.log(
      `Already processed ${set.size} files, now is deal with ${target}`
    );
  }

  const code = fs.readFileSync(target).toString("utf-8");
  const nodeHadRemoveTS = babel.transformSync(code, {
    presets: ["@babel/preset-typescript"],
    plugins: [
      [
        "@babel/plugin-proposal-decorators",
        {
          version: "2021-12",
        },
      ],
    ],
    ast: true,
    filename: target,
    configFile: false,
    sourceMaps: false,
    code: false,
    highlightCode: false,
    comments: false,
  });
  if (!nodeHadRemoveTS.ast) {
    return;
  }
  babel.traverse(nodeHadRemoveTS.ast, {
    enter(p) {
      let value = "";
      // console.log(p.node.type);

      if (p.isImportDeclaration()) {
        value = p.node.source.value;
      } else if (p.isExportNamedDeclaration()) {
        if (!p.node.source) {
          return;
        }
        value = p.node.source.value;
      } else if (p.isCallExpression() && p.node.callee.name === "require") {
        if (typeof p.node.arguments?.[0].value === "string") {
          value = p.node.arguments[0].value;
        } else {
          console.log(target);
        }
      } else if (p.isCallExpression() && p.node.callee.name === "import") {
        if (typeof p.node.arguments?.[0].value === "string") {
          value = p.node.arguments[0].value;
        } else {
          console.log(target);
        }
      } else {
        return;
      }
      if (dir.endsWith("version") && value == "./version") {
        return;
      }
      callback(dir, value);
      // if (dir.includes('component')) {
      //   resolver.resolve({}, dir, `${value}/style`, {}, (err, next) => {
      //     if (err) {
      //       console.log(err);
      //       return ;
      //     };
      //     dfs(getDirFromAbsolutePath(next), getFileFromAbsolutePath(next), set, callback);
      //   });
      // }
      let next = resolve(dir, value);
      dfs(
        getDirFromAbsolutePath(next),
        getFileFromAbsolutePath(next),
        set,
        callback
      );
    },
  });
}

/**
 *
 * @param {(dir: string, file: string) => void} callback
 */
function run(callback) {
  const entryDir = path.resolve(__dirname, "../ant-design/components");
  const entryFile = "index.tsx";
  dfs(entryDir, entryFile, new Set(), callback);
}

// ------------------------

const HEADER = `// DO NOT EDIT THIS FILE.
// It is auto-generated by <project>/bench/scripts/generator-rs-benchmark.js.
`;

function generatorRsBenchmark() {
  const base = path.resolve(__dirname, "../../");
  let content =
    HEADER +
    `
#![feature(test)]
extern crate test;

macro_rules! is_ok {
    ($result: expr) => {
        assert!($result.is_ok())
    };
}

#[cfg(test)] 
mod bench_test {

    use nodejs_resolver::{Resolver, ResolverOptions};
    use std::env::current_dir;
    use std::path::PathBuf;
    use test::Bencher;
    use std::time::Instant;

    #[bench]
    fn ant_design_bench(b: &mut Bencher) {

        b.iter(|| {
          let resolver = Resolver::new(ResolverOptions {
            extensions: vec![
              ".web.tsx",
              ".web.ts",
              ".web.jsx",
              ".web.js",
              ".ts",
              ".tsx",
              ".js",
              ".jsx",
              ".json",
            ].into_iter().map(String::from).collect(),
            ..Default::default()
          });

          let start = Instant::now();
`;
  run(function (dir, file) {
    const relativePath = path.relative(base, dir);
    content += `
            is_ok!(resolver.resolve(
                &PathBuf::from(current_dir().unwrap().join("${relativePath}")), 
                "${file}",
            ));
`;
  });
  content += `
          println!("time cost: {:?} ms", start.elapsed().as_millis());// ms
        });
    }
}\n`;
  console.log("length", content.length);
  const rsFileStoredPath = path.resolve(__dirname, "../../tests/bench.rs");
  fs.writeFileSync(rsFileStoredPath, content);
}

function generatorEnhanceResolveBenchmark() {
  let content =
    HEADER +
    `
console.time('bench');
const path = require('path');
const resolver = require('enhanced-resolve');
const Benchmark = require('benchmark'); 

const resolve = resolver.create.sync({
  extensions: [
    '.web.tsx',
    '.web.ts',
    '.web.jsx',
    '.web.js',
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.json',
  ],
  fileSystem: require('fs'),
  alias: {
    "@ant-design/tools" : path.resolve(__dirname, '../ant-design'),
  },
})


function run() {

`;
  run(function (dir, file) {
    content += `resolve('${dir}', '${file}');\n`;
  });

  content += `
};

// const suite = new Benchmark.Suite();
// suite
//   .add("EnhancedResolve", run)
//   .on('cycle', function(event) {
//     console.log(String(event.target));
//   })
//   .run();

run();

console.timeEnd('bench');
`;
  console.log("length", content.length);
  const jsFileStoredPath = path.resolve(__dirname, "../enhanceResolve.js");
  fs.writeFileSync(jsFileStoredPath, content);
}

function generatorESBuildResolveBenchMark() {
  let content =
    HEADER +
    `

const path = require('path');
const { build } = require('esbuild');
const Benchmark = require('benchmark'); 

async function resolve(dir, id) {
  let result

  await build({
    stdin: {
      contents: \`import \$\{JSON.stringify(id)\}\`,
      resolveDir: dir,
    },
    write: false,
    bundle: true,
    treeShaking: false,
    ignoreAnnotations: true,
    platform: 'node',
    plugins: [{
      name: 'resolve',
      setup({ onLoad }) {
        onLoad({ filter: /.*/ }, (args) => {
          result = args.path
          return { contents: '' }
        })
      },
    }],
  })
  return result
}

const suite = new Benchmark.Suite();

async function run() {
`;
  run(function (dir, file) {
    content += `await resolve('${dir}', '${file}');\n`;
  });

  content += `};

suite
  .add("ESBuildResolve", run)
  .on('cycle', function(event) {
    console.log(String(event.target));
  })
  .run({ 'async': true });
`;
  console.log("length", content.length);
  const jsFileStoredPath = path.resolve(__dirname, "../esbuildResolve.js");
  fs.writeFileSync(jsFileStoredPath, content);
}

function generatorESBuildNativeResolveBenchMark() {
  let content =
    HEADER +
    `
  package main

  import (
    "github.com/evanw/esbuild/pkg/api"
  )
  
  func resolve(dir string, id string) string {
    var result string = ""
    api.Build(api.BuildOptions{
      Stdin: &api.StdinOptions{
        Contents:   "import '" + id + "'",
        ResolveDir: dir,
      },
      Write:             false,
      TreeShaking:       api.TreeShakingFalse,
      Bundle:            true,
      IgnoreAnnotations: true,
      Platform:          api.PlatformNode,
      Plugins: []api.Plugin{{
        Name: "resolve",
        Setup: func(build api.PluginBuild) {
          build.OnLoad(api.OnLoadOptions{Filter: \`.*\`},
            func(args api.OnLoadArgs) (api.OnLoadResult, error) {
              contents := string("")
              result = args.Path
              return api.OnLoadResult{
                Contents: &contents,
              }, nil
            })
        },
      },
      },
    })
    return result
  }
  
  func main() {
  `;
  run(function (dir, file) {
    content += `resolve("${dir}", "${file}");\n`;
  });

  content += `}
  `;
  console.log("length", content.length);
  const goFileStoredPath = path.resolve(
    __dirname,
    "../esbuildResolve_native.go"
  );
  fs.writeFileSync(goFileStoredPath, content);
}


// -------------------------------------------------

if (process.argv[2] === "rs") {
  generatorRsBenchmark();
} else if (process.argv[2] === "esbuild") {
  generatorESBuildResolveBenchMark();
} else if (process.argv[2] === "enhanced") {
  generatorEnhanceResolveBenchmark();
} else if (process.argv[2] === "esbuild_native") {
  generatorkESBuildNativeResolveBenchMark();
  
} else {
  throw Error("Input the correct argument");
}
