import React, {useEffect, useRef, useState} from 'react';
import {Contract, Wavelet} from 'wavelet-client';
import WF from "wavelet-faucet";
import {Box, Flex} from '@rebass/grid';
import {Image} from 'rebass'
import {Label, Select} from '@rebass/forms'
import JSBI from 'jsbi';

const BigInt = JSBI.BigInt;

const App = (props) => {
    const FaucetButton = WF.FaucetButton;
    const theme = WF.themes.mono;

    const [host, setHost] = useState('https://testnet.perlin.net');
    const [privateKey, setPrivateKey] = useState(
        Buffer.from(Wavelet.generateNewWallet().secretKey, 'binary').toString('hex')
    );
    const [client, setClient] = useState(undefined);
    const [contractAddress, setContractAddress] = useState(
        '38f54a1f52ec226a40d806156fb0434c71ae09fd0073aa3de2e0515a8948b0f3'
    );
    const [contract, setContract] = useState(undefined);
    const [voted, setVoted] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const [account, setAccount] = useState(undefined);
    const [contractAccount, setContractAccount] = useState(undefined);

    const accountRef = useRef(account);
    const contractAccountRef = useRef(contractAccount);

    const [year, setYear] = useState(undefined);
    const [location, setLocation] = useState(undefined)

    const [candidates, setCandidates] = useState([]);

    const [voteResults, setVoteResults] = useState([])

    // load dynamically from contract 
    const [preferences,setPreferences] = useState([]);

    useEffect(() => {
        accountRef.current = account;
    }, [account]);

    useEffect(() => {
        contractAccountRef.current = contractAccount;
    }, [contractAccount])

    const [sockets, setSockets] = useState({
        accounts: undefined,
        contract: undefined,
        consensus: undefined
    });

    const socketsRef = useRef(sockets);
    useEffect(() => {
        socketsRef.current = sockets;
    }, [sockets]);

    const reset = () => {
        setClient(undefined);
        setAccount(undefined);
        setContractAccount(undefined);

        setContract(undefined);
        setContractAddress('');
        setVoted(false);
        setSubmitted(false);
        setCandidates([]);
        setYear(undefined);
        setLocation(undefined);
        setVoteResults([]);
        setPreferences([]);


        const sockets = socketsRef.current;

        if (sockets.accounts) {
            sockets.accounts.close(1000, 'connection closing normally');
        }

        if (sockets.contract) {
            sockets.contract.close(1000, 'connection closing normally');
        }

        if (sockets.consensus) {
            sockets.consensus.close(1000, 'connection closing normally');
        }

        setSockets({accounts: undefined, consensus: undefined});
    };

    const connect = async () => {
        if (client === undefined) {
            try {
                const client = new Wavelet(host);

                const wallet = Wavelet.loadWalletFromPrivateKey(privateKey);
                const walletAddress = Buffer.from(wallet.publicKey).toString('hex');
                setAccount(await client.getAccount(walletAddress));

                setClient(client);

                sockets.accounts = await client.pollAccounts(
                    {
                        onAccountUpdated: msg => {
                            switch (msg.event) {
                                case 'balance_updated': {
                                    setAccount({...accountRef.current, balance: msg.balance});
                                    break;
                                }
                                default: {
                                    break;
                                }
                            }
                        }
                    },
                    {id: walletAddress}
                );

                setSockets(sockets);
            } catch (error) {
                reset();
                alert(error);
            }
        } else {
            reset();
        }
    };

    const load = async () => {
        setContractAccount(await client.getAccount(contractAddress));

        // Initialize
        const contract = new Contract(client, contractAddress);
        await contract.init();

        const wallet = Wavelet.loadWalletFromPrivateKey(privateKey);

        // Every single time consensus happens on Wavelet, query for the latest
        // vote results 

        sockets.consensus = await client.pollConsensus({
            onRoundEnded: _ => {
                if (contract === undefined) {
                    return;
                }

                (async () => {
                    await contract.fetchAndPopulateMemoryPages();
                    setVoteResults(parseJson(contract.test(wallet, 'get_vote_results', BigInt(0))));
                })();
            }
        });

        sockets.contract = await client.pollAccounts(
            {
                onAccountUpdated: msg => {
                    switch (msg.event) {
                        case 'gas_balance_updated': {
                            setContractAccount({...contractAccountRef.current, gas_balance: msg.gas_balance});
                            break;
                        }
                        default: {
                            break;
                        }
                    }
                }
            },
            {id: contractAddress}
        );

        setSockets(sockets);
        
        setYear(contract.test(wallet, 'get_vote_year', BigInt(0)).logs);
        setLocation(contract.test(wallet, 'get_location', BigInt(0)).logs);

        setCandidates(parseString(contract.test(wallet, 'get_candidates', BigInt(0))));
        setVoteResults(parseJson(contract.test(wallet,'get_vote_results', BigInt(0))));
        setPreferences(new Uint8Array(parseString(contract.test(wallet, 'get_candidates', BigInt(0))).length));
        setContract(contract);
    };

    const sendVote = async () => {
        const wallet = Wavelet.loadWalletFromPrivateKey(privateKey);
        const response = contract.test(wallet, 'send_vote', BigInt(0), BigInt(250000), BigInt(0), {
            type: 'bytes',
            value: preferences
        });
        if (!checkVoteValid(response)) {
            return;
        };
        await contract.call(wallet, 'send_vote', BigInt(0), BigInt(250000), BigInt(0), {
            type: 'bytes',
            value: preferences
        });
        setPreferences([]);
        setVoted(false);
        setSubmitted(true);
    };
    const checkVoteValid = (response) => {
        const {result} = response;
        if (result != null) {
            window.alert(result);
            return 0;
        }
        return 1;
    }
    const configurePreferences = (preference, candidate, index) => {
        preference = parseInt(preference);
        preferences[index] = preference;
        setVoted(true);
    };

    const parseJson = (response) => {
        const {logs}  = response;
        const data = JSON.parse(logs[0]);
        return data;
    };

    const parseString = (response) => {
        const {logs} = response;
        const data = logs[0].split("\n");
        return data;
    };
    // error if vote invalid 
    return (
        <>
        <Flex flexWrap='wrap' mx={-2}>
            <Box width={1/2} px={3} pr={4}>
                <Box mb={4} alignItems="center">
                    <h1 className="text-center title" mb={4} pb={4}>
                    LOAD ELECTION CONTRACT
                    </h1>
                </Box>
                <Flex mb={2} alignItems="center">
                    <Box flex="0 0 80px">
                        <label>[node]</label>
                    </Box>
                    <Box flex="1">
                        <Flex width="1">
                            <Box flex="1">
                                <input
                                    type="text"
                                    value={host}
                                    disabled={client}
                                    data-lpignore="true"
                                    onKeyPress={async e => {
                                        if (e.key === 'Enter') {
                                            await connect();
                                        }
                                    }}
                                    onChange={evt => setHost(evt.target.value)}
                                />
                            </Box>
                        </Flex>
                    </Box>
                </Flex>
                <Flex mb={2} alignItems="center">
                    <Box flex="0 0 80px">
                        <label>[secret]</label>
                    </Box>
                    <Box flex="1">
                        <input
                            type="text"
                            value={privateKey}
                            placeholder="input unique secret..."
                            disabled={client}
                            data-lpignore="true"
                            onChange={evt => setPrivateKey(evt.target.value)}
                        />
                    </Box>
                    <Box width={3 / 16} style={{minWidth: '10em'}} ml={2}>
                                <button
                                    style={{width: '100%'}}
                                    onClick={connect}
                                    disabled={privateKey.length !== 128}
                                >
                                    {client ? 'Disconnect' : 'Connect'}
                                </button>
                            </Box>
                </Flex>
                <Flex mb={4} alignItems="center">
                    <Box flex="0 0 80px">
                        <label>[contract]</label>
                    </Box>
                    <Box flex="1">
                        <Flex width={1}>
                            <Box width={9 / 12}>
                                <input
                                    type="text"
                                    value={contractAddress}
                                    placeholder="input ballot paper smart contract address..."
                                    disabled={!client}
                                    data-lpignore="true"
                                    onKeyPress={async e => {
                                        if (e.key === 'Enter') await load();
                                    }}
                                    onChange={evt => setContractAddress(evt.target.value)}
                                />
                            </Box>
                            <Box width={3 / 12} style={{minWidth: '10em'}} ml={2}>
                                <button
                                    style={{width: "100%"}}
                                    disabled={!client || contractAddress.length !== 64}
                                    onClick={load}
                                >
                                    Load Ballot Paper
                                </button>
                            </Box>
                        </Flex>
                    </Box>
                </Flex>
                <FaucetButton modalHeader theme={theme} style={{position: 'fixed', right: '50px', bottom: '0px'}} address={account && account.public_key} classPrefix="faucet"> 
                Faucet
                </FaucetButton>
                <Box mt={4} mb={4} alignItems="center">
                    <h1 className="text-center title">
                    CURRENT VOTING RESULTS
                    </h1>
                </Box> 
                {voteResults.map((result) => (
                    <Flex mb={4} alignItems="center">
                    <Box width={3/4}>
                        <label>{result.candidate}</label>
                    </Box>
                    <Box flex="1">
                        {result.points} point(s)
                    </Box>
                </Flex>
                ))}
            </Box>      
        <Box width={1/2} px={2}>
            <Image 
                src='/logo-crest.png' 
                sx={{
                    width: [ '20%', '25%' ]
                }}/>
            <Box mb={4} alignItems="center">
                <h1 className="text-center title" mb={4} pb={4}>
                BALLOT PAPER
                </h1>
                <h2>
                    Year: {year}
                </h2>
                <h2>
                    Location: {location}
                </h2>
            </Box>
            {candidates.map((candidate, index) => (
                <Flex mb={4} alignItems="center">
                <Box width='4em' style={{minWidth: '4em'}} ml={2}>
                <Select
                    name={candidate}
                    defaultValue='0'
                    onChange={evt => configurePreferences(evt.target.value, candidate, index)}
                    >
                    <option value='0' disabled></option>
                    {candidates.map((c, i) => (
                    
                    <option
                        value={candidates.length - i}>
                        {i+1}
                    </option>
                    ))}
                </Select>
                </Box>
                <Box flex="1">
                    <Label px={4}>{candidate}</Label>
                </Box>
                </Flex>
            ))}
            <Flex>
            <Box width={1/2}> </Box>
            <Box flex="1" width={5/17} mb={4}>
                <button
                    className="fw"
                    style={{height: "98%"}}
                    disabled={
                        !client ||
                        !contract ||
                        !account ||
                        account.balance < 2 ||
                        contractAccount.gas_balance + account.balance < 250000 ||
                        !voted ||
                        submitted
                    }
                    onClick={sendVote}
                >
                    Submit Vote
                </button>
            </Box>
            </Flex>
            <Flex mb={2} style={{textAlign:"right"}}>
                <Box flex="0 0 150px">
                    <label>Balance</label>
                </Box>
                <Box flex="1">
          <span>{`${
              account && account.balance ? account.balance : 0
              } PERL(s)`}</span>
                </Box>
            </Flex>
            </Box>
        </Flex>
        </>
    );
};

export default App;