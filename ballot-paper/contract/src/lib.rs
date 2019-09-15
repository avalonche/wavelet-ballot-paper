// ballot paper smart contract 

use smart_contract_macros::smart_contract;

use smart_contract::log;
use smart_contract::payload::Parameters;

use serde_json::json;
use serde_json::Value;

use std::collections::HashMap;
use std::collections::HashSet;

pub struct Vote {
    candidate: &'static str,
    points: u8
}
pub struct BallotPaper {
    year: u16,
    location: &'static str,
    results: Vec<Vote>,  // candidate number, points
    votes: HashMap<[u8; 32], Vec<Vote>> // voter public address, vector of preferences 
}

#[smart_contract]
impl BallotPaper {
    fn init(_params: &mut Parameters) -> Self {
        let year: u16 = 2020;

        let location = "NORTH HUDSON";

        // initialise candidates
        let mut results = Vec::new();
        results.push(Vote {candidate: "AYIREBI, CECIL (LIBERAL)", points: 0});
        results.push(Vote {candidate: "BUTLER, DIONE (REPUBLICAN)", points: 0});
        results.push(Vote {candidate: "GARSIDE, CHARLES (LABOUR)", points: 0});
        results.push(Vote {candidate: "KING, STUART (DEMOCRATIC)", points: 0});
        results.push(Vote {candidate: "WHITWELL, FRANK (GREEN)", points: 0});
        // vote results are initially set to 0
        Self { 
            year,
            location,
            results,
            votes: HashMap::new(),
        }
    }

    fn send_vote(&mut self, params: &mut Parameters) -> Result<(), String> {
        let voter = params.sender;

        let preferences: Vec<u8>  = params.read();
        let mut checkvote = HashSet::new();
        let mut vote = Vec::new();

        // 1 voter can only vote once (public key must be unique)
        if self.votes.contains_key(&voter) {
            return Err("This address has already voted.".into());
        }
        for preference in &preferences {
            if preference.clone() != 0 && checkvote.contains(preference){
                return Err("This vote contains recurring vote number".into());
            }
            checkvote.insert(preference);
        }
        
        // aggregate the votes
        for i in 0..preferences.len() {
            vote.push(Vote {candidate: self.results[i].candidate, points: preferences[i]});
            self.results[i].points += preferences[i];
        }

        self.votes.insert(voter, vote);
        Ok(())
    }
    
    fn get_candidates(&mut self, _params: &mut Parameters) -> Result<(), String> {
        let mut candidates = Vec::new();

        for candidate in &self.results {
            candidates.push(candidate.candidate);
        }

        log(&candidates.join("\n"));

        Ok(())
    }

    fn get_vote_year(&mut self, _params: &mut Parameters) -> Result<(), String> {
        log(&self.year.to_string());

        Ok(())
    }

    fn get_location(&mut self, _params: &mut Parameters) -> Result<(), String> {
        log(&self.location);

        Ok(())
    }

    fn get_vote_results(&mut self, _params: &mut Parameters) -> Result<(), String> {
        let results: Vec<Value> = self
            .results
            .iter()
            .map(|result| -> Value {
                json!({
                    "candidate": result.candidate.clone(),
                    "points": result.points.clone()
                })
            })
            .collect();
        
        let results_json = serde_json::to_string(&results).unwrap();
        log(&results_json);

        Ok(())
    }
}