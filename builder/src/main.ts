/**
 * OpenArabicMusicArrangerStyles
 * Copyright (C) 2025 Amir Czwink (amir130@hotmail.de)
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 * 
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * */
import fs from "fs";
import { Midi } from '@tonejs/midi'
import path from "path";
import YAML from 'yaml';
import { InstrumentDefinition, TrackDefinition } from "./definitions";

const quarterTime = 1; //at 60 BPM
const timeDurations = {
    2: (quarterTime * 2),
    4: quarterTime,
    "4.": (quarterTime / 2) * 3,
    8: quarterTime / 2,
    "8.": (quarterTime / 4) * 3,
    16: quarterTime / 4
};

function FindInstrument(instruments: Map<string, InstrumentDefinition>, instrumenType: string)
{
    for (const [name, instrumentDef] of instruments)
    {
        if(instrumentDef.type === instrumenType)
            return instrumentDef;
    }
}

function PitchToMIDI(pitch: string)
{
    function AccidentalToMIDI(acc: string)
    {
        switch(acc)
        {
            case "":
                return 0;
        }
        throw new Error("Illegal Accidental: " + acc);
    }

    function NaturalPitchToMIDI(naturalPitch: string)
    {
        switch(naturalPitch)
        {
            case "c":
                return 0;
            case "e":
                return 4;
            case "g":
                return 7;
        }
        throw new Error("Illegal pitch: " + naturalPitch);
    }
    function OctavePitchToMIDI(octavePitch: string)
    {
        return NaturalPitchToMIDI(octavePitch[0]) + AccidentalToMIDI(octavePitch.substring(1));
    }

    const octave = parseInt(pitch[pitch.length - 1]) + 1;
    const octavePitch = pitch.substring(0, pitch.length - 1);

    return octave * 12 + OctavePitchToMIDI(octavePitch);
}

function EvaluatePitch(pitch: string, instrument: InstrumentDefinition)
{
    const midiPitch = (instrument.pitchMap === undefined) ? PitchToMIDI(pitch) : instrument.pitchMap[pitch];
    if(midiPitch === undefined)
        throw new Error("Unknown pitch '" + pitch + "' in instrument ");
    return midiPitch;
}

async function GenerateMIDI(inputDirPath: string, instruments: Map<string, InstrumentDefinition>)
{
    const numberOfLoops = 4;

    const trackFiles = await fs.promises.readdir(inputDirPath, "utf-8");

    const midi = new Midi();
    midi.header.setTempo(120);

    let channelCounter = 0;
    for (const trackFileName of trackFiles)
    {
        const trackFilePath = path.join(inputDirPath, trackFileName);
        const textData = await fs.promises.readFile(trackFilePath, "utf-8");

        const track = YAML.parse(textData).track as TrackDefinition;
        const instrument = FindInstrument(instruments, track.instrument);
        if(instrument === undefined)
            throw new Error("Couldn't find an instrument of type: " + track.instrument);

        const midiTrack = midi.addTrack();
        if(instrument.program !== undefined)
        {
            midiTrack.channel = channelCounter++;
            if(midiTrack.channel === 9)
                midiTrack.channel = channelCounter++;
            midiTrack.instrument.number = instrument.program - 1;
        }
        if(instrument.pitchMap !== undefined) //its a drum
            midiTrack.channel = 9;

        let t = 0;
        for(let l = 0; l < numberOfLoops; l++)
        {
            for (const entry of track.notes)
            {
                const durationInSecs = timeDurations[entry.duration];
                if(durationInSecs === undefined)
                    throw new Error("Unknown note duration: " + entry.duration);

                if("pitch" in entry)
                {
                    midiTrack.addNote({
                        midi: EvaluatePitch(entry.pitch, instrument),
                        time: t,
                        duration: durationInSecs
                    });
                }
                else if("pitches" in entry)
                {
                    for (const pitch of entry.pitches)
                    {
                        midiTrack.addNote({
                            midi: EvaluatePitch(pitch, instrument),
                            time: t,
                            duration: durationInSecs
                        });
                    }
                }

                t += durationInSecs;
            }
        }
    }

    fs.writeFileSync("output.mid", Buffer.from(midi.toArray()));
}

async function LoadInstruments(inputDirPath: string)
{
    const dict = new Map<string, InstrumentDefinition>();

    const fileNames = await fs.promises.readdir(inputDirPath, "utf-8");
    for (const fileName of fileNames)
    {
        const filePath = path.join(inputDirPath, fileName);
        const textData = await fs.promises.readFile(filePath, "utf-8");

        const instrument = YAML.parse(textData).instrument as InstrumentDefinition;

        const parsed = path.parse(fileName);
        dict.set(parsed.name, instrument);
    }

    return dict;
}

async function Main()
{
    const inputPath = "../../data";

    const instruments = await LoadInstruments(path.join(inputPath, "instruments"));
    await GenerateMIDI(path.join(inputPath, "styles", "sa3idi"), instruments);
}

Main();