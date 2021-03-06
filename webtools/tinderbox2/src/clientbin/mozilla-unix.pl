#!/usr/bin/perl

require 5.000;

use Sys::Hostname;
use Cwd;

$Version = "1.000";

sub InitVars {

    # PLEASE FILL THIS IN WITH YOUR PROPER EMAIL ADDRESS
    $BuildAdministrator = "$ENV{'USER'}\@$ENV{'HOST'}";

    #Default values of cmdline opts
    $BuildDepend = 1;	#depend or clobber
    $ReportStatus = 1;  # Send results to server or not
    $BuildOnce = 0;     # Build once, don't send results to server
    $BuildClassic = 0;  # Build classic source

    #relative path to binary
    $BinaryName{'x'} = 'mozilla-export';
    $BinaryName{'qt'} = 'qtmozilla-export';
    $BinaryName{'gnome'} = 'gnuzilla-export';
    $BinaryName{'webshell'} = '/webshell/tests/viewer/viewer';
    $BinaryName{'xpfe'} = '/xpfe/xpviewer/src/xpviewer';

    # Set these to what makes sense for your system
    $cpus = 1;
    $Make = 'gmake'; # Must be gnu make
    $mail = '/bin/mail';
    $Autoconf = 'autoconf -l build/autoconf';
    $CVS = 'cvs -z3';
    $CVSCO = 'co -P';

    # Set these proper values for your tinderbox server
    $Tinderbox_server = 'tinderbox-daemon\@warp.mcom.com';
    #$Tinderbox_server = 'external-tinderbox-incoming\@tinderbox.seawood.org';

    # These shouldn't really need to be changed
    $BuildSleep = 10; # Minimum wait period from start of build to start
                      # of next build in minutes
    $BuildTree = 'raptor';
    $BuildTag = '';
    $BuildName = '';
    $TopLevel = '.';
    $Topsrcdir = 'mozilla';
    $BuildObjName = '';
    $BuildConfigDir = 'mozilla/config';
    $ClobberStr = 'realclean';
    $ConfigureEnvArgs = 'CFLAGS=-pipe CXXFLAGS=-pipe';
    #$ConfigureEnvArgs = '';
    $ConfigureArgs = "--cache-file=/dev/null";
    $ConfigGuess = './build/autoconf/config.guess';
    $Logfile = '${BuildDir}.log';
} #EndSub-InitVars

sub ConditionalArgs {
    if ( $BuildClassic ) {
	$FE = 'x';
	$ConfigureArgs .= " --enable-fe=$FE";
	$BuildTree = 'raptor';
	$BuildModule = 'Raptor';
	$BuildTag = ''
	    if ($BuildTag eq '');
	$TopLevel = "mozilla-classic";
    } else {
	$BuildTree = 'raptor';
#	$Toolkit = 'gtk';
	$FE = 'webshell,xpfe'; 
	$BuildModule = 'Raptor';
#	$ConfigureArgs .= " --enable-toolkit=$Toolkit";
    }
    $CVSCO .= " -r $BuildTag" if ( $BuildTag ne '');
}
sub SetupEnv {
    umask(0);
    $ENV{"CVSROOT"} = ':pserver:anonymous@cvs-mirror.mozilla.org:/cvsroot';
} #EndSub-SetupEnv

sub SetupPath {
    my($Path);
    $Path = $ENV{PATH};
    print "Path before: $Path\n";

    if ( $OS eq 'SunOS' ) {
	$ENV{'PATH'} = '/usr/ccs/bin:' . $ENV{'PATH'};
    }

    $Path = $ENV{PATH};
    print "Path After: $Path\n";
} #EndSub-SetupPath

##########################################################################
# NO USER CONFIGURABLE PIECES BEYOND THIS POINT                          #
##########################################################################

sub GetSystemInfo {

    $OS = `uname -s`;
    $OSVer = `uname -r`;
    
    chop($OS, $OSVer);
    
    if ( $OS eq 'AIX' ) {
	$OSVer = `uname -v`;
	chop($OSVer);
	$OSVer = $OSVer . "." . `uname -r`;
	chop($OSVer);
    }
        
    if ( $OS eq 'IRIX64' ) {
	$OS = 'IRIX';
    }
    
    if ( $OS eq 'SCO_SV' ) {
	$OS = 'SCOOS';
	$OSVer = '5.0';
    }
    
    my $host, $myhost = hostname;
    chomp($myhost);
    ($host, $junk) = split(/\./, $myhost);
	
    $BuildName = ""; 
	
    if ( "$host" ne "" ) {
	$BuildName = $host . ' ';
    }
    $BuildName .= $OS . ' ' . $OSVer . ' ' . ($BuildDepend?'Depend':'Clobber');
    $DirName = $OS . '_' . $OSVer . '_' . ($BuildDepend?'depend':'clobber');
    
    $RealOS = $OS;
    $RealOSVer = $OSVer;
    
    if ( $OS eq 'HP-UX' ) {
	$RealOSVer = substr($OSVer,0,4);
    }
    
    if ( $OS eq 'Linux' ) {
	$RealOSVer = substr($OSVer,0,3);
    }

    if ($BuildClassic) {
        $logfile = "${DirName}-classic.log";
    } else {
	$logfile = "${DirName}.log";
    }
} #EndSub-GetSystemInfo

sub BuildIt {
    my ($fe, @felist, $EarlyExit, $LastTime, $StartTimeStr);

    mkdir("$DirName", 0777);
    chdir("$DirName") || die "Couldn't enter $DirName";
    
    $StartDir = getcwd();
    $LastTime = 0;
    
    print "Starting dir is : $StartDir\n";
    
    $EarlyExit = 0;
    
    while ( ! $EarlyExit ) {
	chdir("$StartDir");
	if ( time - $LastTime < (60 * $BuildSleep) ) {
	    $SleepTime = (60 * $BuildSleep) - (time - $LastTime);
	    print "\n\nSleeping $SleepTime seconds ...\n";
	    sleep($SleepTime);
	}
	
	$LastTime = time;
	
	$StartTime = time - 60 * 10;
	$StartTimeStr = &CVSTime($StartTime);
	
	&StartBuild if ($ReportStatus);
 	$CurrentDir = getcwd();
	if ( $CurrentDir ne $StartDir ) {
	    print "startdir: $StartDir, curdir $CurrentDir\n";
	    die "curdir != startdir";
	}

	$BuildDir = $CurrentDir;
	
	unlink( "$logfile" );
	
	print "opening $logfile\n";
	open( LOG, ">$logfile" ) || print "can't open $?\n";
	print LOG "current dir is -- $hostname:$CurrentDir\n";
	print LOG "Build Administrator is $BuildAdministrator\n";
	&PrintEnv;
	
	$BuildStatus = 0;

	mkdir($TopLevel, 0777);
	chdir($TopLevel) || die "chdir($TopLevel): $!\n";
	
	if ( $BuildClassic ) {
	    print"$CVS $CVSCO $BuildModule\n";
	    print LOG "$CVS $CVSCO $BuildModule\n";
	    open (PULL, "$CVS $CVSCO $BuildModule 2>&1 |") || die "open: $!\n";
	} else {
#	    print "$CVS $CVSCO mozilla/nglayout.mk\n";
#	    print LOG "$CVS $CVSCO mozilla/nglayout.mk\n";
#	    open (PULL, "$CVS $CVSCO mozilla/nglayout.mk 2>&1 |") || die "open: $!\n";
	    print "$CVS $CVSCO mozilla/client.mk\n";
	    print LOG "$CVS $CVSCO mozilla/client.mk\n";
	    open (PULL, "$CVS $CVSCO mozilla/client.mk 2>&1 |") || die "open: $!\n";
	}
	while (<PULL>) {
	    print $_;
	    print LOG $_;
	}
	close(PULL);
	
	# Move to topsrcdir
	#chdir($Topsrcdir) || die "chdir($Topsrcdir): $!\n";
         

	# Do a separate checkout with toplevel makefile
	if (! $BuildClassic) {
	 #  print LOG "$Make -f nglayout.mk pull_all CVSCO='$CVS $CVSCO'|\n";
	 #  open (PULLALL, "$Make -f nglayout.mk pull_all CVSCO='$CVS $CVSCO' |\n");
	    print LOG "$Make -f mozilla/client.mk checkout CVSCO='$CVS $CVSCO'|\n";
	    open (PULLALL, "$Make -f mozilla/client.mk checkout CVSCO='$CVS $CVSCO' |\n");
	    while (<PULLALL>) {
		print LOG $_;
		print $_;
	    }
	    close(PULLALL);
	}

	chdir($Topsrcdir) || die "chdir($Topsrcdir): $!\n";

	print LOG "$Autoconf\n";
	open (AUTOCONF, "$Autoconf 2>&1 | ") || die "$Autoconf: $!\n";
	while (<AUTOCONF>) {
	    print LOG $_;
	    print $_;
	}
	close(AUTOCONF);

	print LOG "$ConfigGuess\n";
	$BuildObjName = "obj-";
	open (GETOBJ, "$ConfigGuess 2>&1 |") || die "$ConfigGuess: $!\n";
	while (<GETOBJ>) {
	    print $_;
	    print LOG $_;
	    chomp($BuildObjName .= $_); 
	}
	close (GETOBJ); 
	
	mkdir($BuildObjName, 0777);
	chdir($BuildObjName) || die "chdir($BuildObjName): $!\n";
	
	print LOG "$ConfigureEnvArgs ../configure $ConfigureArgs\n";
	open (CONFIGURE, "$ConfigureEnvArgs ../configure $ConfigureArgs 2>&1 |") || die "../configure: $!\n";
	while (<CONFIGURE>) {
	    print $_;
	    print LOG $_;
	}
	close(CONFIGURE);
	    
	# if we are building depend, rebuild dependencies
	
	if ($BuildDepend) {
	    print LOG "$Make MAKE='$Make -j $cpus' depend 2>&1 |\n";
	    open ( MAKEDEPEND, "$Make MAKE='$Make -j $cpus' depend 2>&1 |\n");
	    while ( <MAKEDEPEND> ) {
		print $_;
		print LOG $_;
	    }
	    close (MAKEDEPEND);
	    system("rm -rf dist");

	} else {
	    # Building clobber
	    print LOG "$Make MAKE='$Make -j $cpus' $ClobberStr 2>&1 |\n";
	    open( MAKECLOBBER, "$Make MAKE='$Make -j $cpus' $ClobberStr 2>&1 |");	    
	    while ( <MAKECLOBBER> ) {
	    	print $_;
	    	print LOG $_;
	    }
	    close( MAKECLOBBER );
	}

	@felist = split(/,/, $FE);
	    
	foreach $fe ( @felist ) {	    
	    if (&BinaryExists($fe)) {
		print LOG "deleting existing binary\n";
		&DeleteBinary($fe);
	    }
	}

	if ($BuildClassic) {
	    # Build the BE only	    
	    print LOG "$Make MAKE='$Make -j $cpus' MOZ_FE= 2>&1 |\n";
	    open( BEBUILD, "$Make MAKE='$Make -j $cpus' MOZ_FE= 2>&1 |");
	    
	    while ( <BEBUILD> ) {
		print $_;
		print LOG $_;
	    }
	    close( BEBUILD );

	    foreach $fe ( @felist ) {		   
		# Now build each front end
		print LOG "$Make MAKE='$Make -j $cpus' -C cmd/${fe}fe 2>&1 |\n";
		open(FEBUILD, "$Make MAKE='$Make -j $cpus' -C cmd/${fe}fe 2>&1 |\n");
		while (<FEBUILD>) {
		    print $_;
		    print LOG $_;
		}
		close(FEBUILD);
	    }
	} else {
		print LOG "$Make MAKE='$Make -j $cpus' 2>&1 |\n";
		open(BUILD, "$Make MAKE='$Make -j $cpus' 2>&1 |\n");
		while (<BUILD>) {
		    print $_;
		    print LOG $_;
		}
		close(BUILD);
	}

	foreach $fe (@felist) {
	    if (&BinaryExists($fe)) {
		print LOG "export binary exists, build SUCCESSFUL!\n";
		$BuildStatus = 0;
	    }
	    else {
		print LOG "export binary missing, build FAILED\n";
		$BuildStatus = 666;
	    }
	    
	    print LOG "\nBuild Status = $BuildStatus\n";
	    
	    $BuildStatusStr = ( $BuildStatus ? 'busted' : 'success' );
	    
	    print LOG "tinderbox: tree: $BuildTree\n";
	    print LOG "tinderbox: builddate: $StartTime\n";
	    print LOG "tinderbox: status: $BuildStatusStr\n";
	    print LOG "tinderbox: build: $BuildName $fe\n";
	    print LOG "tinderbox: errorparser: unix\n";
	    print LOG "tinderbox: buildfamily: unix\n";
	    print LOG "tinderbox: END\n";	    
	}
	close(LOG);
	chdir("$StartDir");
	
# this fun line added on 2/5/98. do not remove. Translated to english,
# that's "take any line longer than 1000 characters, and split it into less
# than 1000 char lines.  If any of the resulting lines is
# a dot on a line by itself, replace that with a blank line."  
# This is to prevent cases where a <cr>.<cr> occurs in the log file.  Sendmail
# interprets that as the end of the mail, and truncates the log before
# it gets to Tinderbox.  (terry weismann, chris yeh)
#
# This was replaced by a perl 'port' of the above, writen by 
# preed@netscape.com; good things: no need for system() call, and now it's
# all in perl, so we don't have to do OS checking like before.

	open(LOG, "$logfile") || die "Couldn't open logfile: $!\n";
	open(OUTLOG, ">${logfile}.last") || die "Couldn't open logfile: $!\n";
	    
	while (<LOG>) {
	    $q = 0;
	    
	    for (;;) {
		$val = $q * 1000;
		$Output = substr($_, $val, 1000);
		
		last if $Output eq undef;
		
		$Output =~ s/^\.$//g;
		$Output =~ s/\n//g;
		print OUTLOG "$Output\n";
		$q++;
	    } #EndFor
		
	} #EndWhile
	    
	close(LOG);
	close(OUTLOG);

	system( "$mail $Tinderbox_server < ${logfile}.last" )
	    if ($ReportStatus );
	unlink("$logfile");
	
	# if this is a test run, set early_exit to 0. 
	#This mean one loop of execution
	$EarlyExit++ if ($BuildOnce);
    }
    
} #EndSub-BuildIt

sub CVSTime {
    my($StartTimeArg) = @_;
    my($RetTime, $StartTimeArg, $sec, $minute, $hour, $mday, $mon, $year);
    
    ($sec,$minute,$hour,$mday,$mon,$year) = localtime($StartTimeArg);
    $mon++; # month is 0 based.
    
    sprintf("%02d/%02d/%02d %02d:%02d:00", $mon,$mday,$year,$hour,$minute );
}

sub StartBuild {
    
    my($fe, @felist);

    @felist = split(/,/, $FE);

#    die "SERVER: " . $Tinderbox_server . "\n";
    open( LOG, "|$mail $Tinderbox_server" );
    foreach $fe ( @felist ) {
	print LOG "\n";
	print LOG "tinderbox: tree: $BuildTree\n";
	print LOG "tinderbox: builddate: $StartTime\n";
	print LOG "tinderbox: status: building\n";
	print LOG "tinderbox: build: $BuildName $fe\n";
	print LOG "tinderbox: errorparser: unix\n";
	print LOG "tinderbox: buildfamily: unix\n";
	print LOG "tinderbox: END\n";
	print LOG "\n";
    }
    close( LOG );
}

# check for the existence of the binary
sub BinaryExists {
    my($fe) = @_;
    my($Binname);
    $fe = 'x' if (!defined($fe)); 

    if ($BuildClassic) {
	$BinName = $BuildDir . '/' . $TopLevel . '/' . $Topsrcdir . '/'. $BuildObjName . "/cmd/${fe}fe/" . $BinaryName{"$fe"};
    } else {
	$BinName = $BuildDir . '/' . $TopLevel . '/' . $Topsrcdir . '/' . $BuildObjName . $BinaryName{"$fe"};
    }
    print LOG $BinName . "\n"; 
    if ((-e $BinName) && (-x $BinName) && (-s $BinName)) {
	1;
    }
    else {
	0;
    }
}

sub DeleteBinary {
    my($fe) = @_;
    my($BinName);
    $fe = 'x' if (!defined($fe)); 

    if ($BuildClassic) {
	$BinName = $BuildDir . '/' . $TopLevel . '/' . $Topsrcdir . '/' . $BuildObjName . "/cmd/${fe}fe/" . $BinaryName{"$fe"};
    } else {
	$BinName = $BuildDir . '/' . $TopLevel . '/' . $Topsrcdir . '/' . $BuildObjName . $BinaryName{"$fe"};
    }
    print LOG "unlinking $BinName\n";
    unlink ($BinName) || print LOG "unlinking $BinName failed\n";
}

sub ParseArgs {
    my($i, $manArg);

    if( @ARGV == 0 ) {
	&PrintUsage;
    }
    $i = 0;
    $manArg = 0;
    while( $i < @ARGV ) {
	if ($ARGV[$i] eq '--depend') {
	    $BuildDepend = 1;
 	    $manArg++;
	}
	elsif ($ARGV[$i] eq '--clobber') {
	    $BuildDepend = 0;
	    $manArg++;
	}
	elsif ( $ARGV[$i] eq '--once' ) {
	    $BuildOnce = 1;
	    #$ReportStatus = 0;
	}
	elsif ($ARGV[$i] eq '--classic') {
	    $BuildClassic = 1;
	}
	elsif ($ARGV[$i] eq '--noreport') {
	    $ReportStatus = 0;
	}
	elsif ($ARGV[$i] eq '--version' || $ARGV[$i] eq '-v') {
	    die "$0: version $Version\n";
	}
	elsif ( $ARGV[$i] eq '-tag' ) {
	    $i++;
	    $BuildTag = $ARGV[$i];
	    if ( $BuildTag eq '' || $BuildTag eq '-t') {
		&PrintUsage;
	    }
	}
	elsif ( $ARGV[$i] eq '-t' ) {
	    $i++;
	    $BuildTree = $ARGV[$i];
	    if ( $BuildTree eq '' ) {
		&PrintUsage;
	    }
	} else {
	    &PrintUsage;
	}

	$i++;
    } #EndWhile

    if ( $BuildTree =~ /^\s+$/i ) {
	&PrintUsage;
    }

    if ($BuildDepend eq undef) {
	&PrintUsage;
    }

    &PrintUsage if (! $manArg );

} #EndSub-ParseArgs

sub PrintUsage {
    die "usage: $0 [--depend | --clobber] [-v | --version ] [--once --classic --noreport -tag TREETAG -t TREENAME ]\n";
}

sub PrintEnv {
    my ($key);
    foreach $key (keys %ENV) {
	print LOG "$key = $ENV{$key}\n";
	print "$key = $ENV{$key}\n";
    }
} #EndSub-PrintEnv

# Main function
&InitVars;
&ParseArgs;
&ConditionalArgs;
&GetSystemInfo;
&SetupEnv;
&SetupPath;
&BuildIt;

1;
