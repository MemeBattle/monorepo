use clap::Parser;
use memebattle_post::{
    arguments::{Arguments, Command},
    create,
};
use miette::Context;

fn main() -> miette::Result<()> {
    let arguments = Arguments::parse();

    match arguments.command {
        Command::Create(options) => create(arguments.dir, options).wrap_err("mems_post::crate"),
    }
}
